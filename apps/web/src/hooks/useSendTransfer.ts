/**
 * useSendTransfer.ts — Hook for ephemeral one-shot send flow
 *
 * Send flow:
 *  1. Sender: generate AES key, encrypt file in-browser
 *  2. Create send room via POST /api/rooms/send
 *  3. Register file via POST /api/rooms/:roomId/files/send → get presigned PUT URL
 *  4. Upload encrypted blob to S3
 *  5. Key lives ONLY in the share URL fragment: /r/:roomId#key=<base64url>
 *  6. Connect WebSocket to RoomDO, wait for receiver to join
 *  7. Attempt WebRTC P2P transfer; fall back to S3 already uploaded
 *
 * Receive flow:
 *  1. Parse roomId from path, key from URL fragment (#key=...)
 *  2. Connect WebSocket to RoomDO as "receiver"
 *  3. Try P2P: sender is online → do WebRTC transfer → decrypt → save
 *  4. Fallback: GET presigned URL from /api/rooms/:roomId/send → download + decrypt
 */

import type {
	AddSendFileResponse,
	ClientMessage,
	CreateSendRoomResponse,
	ReceivePhase,
	RTCSignalPayload,
	SendPhase,
	SendRoomResponse,
	ServerMessage,
	TransferProgress,
} from "@flop/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	decryptBlob,
	downloadBuffer,
	encryptFile,
	exportKey,
	generateKey,
	importKey,
} from "@/lib/crypto";
import { setupReceiver, setupSender } from "@/lib/webrtc";

const WS_BASE = (() => {
	const proto = window.location.protocol === "https:" ? "wss" : "ws";
	return `${proto}://${window.location.host}`;
})();

// ─── Send hook ────────────────────────────────────────────────────────────────

export interface UseSendTransferReturn {
	phase: SendPhase;
	shareUrl: string | null;
	progress: TransferProgress;
	error: string | null;
	send: (files: File[]) => Promise<void>;
	reset: () => void;
}

export function useSendTransfer(): UseSendTransferReturn {
	const [phase, setPhase] = useState<SendPhase>("idle");
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [progress, setProgress] = useState<TransferProgress>({
		bytes: 0,
		total: 0,
		percent: 0,
	});
	const [error, setError] = useState<string | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const senderRefs = useRef<Map<string, { handleSignal: (p: RTCSignalPayload) => Promise<void>; close: () => void }>>(new Map());
	const doneRef = useRef(false);

	// Cleanup on unmount: close any live WebSocket / sender peer connection
	useEffect(() => {
		return () => {
			wsRef.current?.close();
			senderRefs.current.forEach(s => s.close());
		};
	}, []);

	const reset = useCallback(() => {
		wsRef.current?.close();
		senderRefs.current.forEach(s => s.close());
		senderRefs.current.clear();
		wsRef.current = null;
		doneRef.current = false;
		setPhase("idle");
		setShareUrl(null);
		setProgress({ bytes: 0, total: 0, percent: 0 });
		setError(null);
	}, []);

	const send = useCallback(async (files: File[]) => {
		if (!files.length) return;
		try {
			setPhase("encrypting");
			setError(null);

			// Step 1 & 2: Create send room
			const createRes = await fetch("/api/rooms/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ expiresIn: 24 }),
			});
			if (!createRes.ok) {
				const err = await createRes.json().catch(() => ({ error: "Room creation failed" }));
				throw new Error((err as { error: string }).error);
			}
			const { roomId } = (await createRes.json()) as CreateSendRoomResponse;

			// Prepare files
			const fileRecords: { fileId: string; putUrl: string; encryptedBlob: ArrayBuffer; name: string; size: number }[] = [];
			let totalUploadBytes = 0;
			
			for (const file of files) {
				const key = await generateKey();
				const keyBase64 = await exportKey(key);
				const { encryptedBlob, ivBase64 } = await encryptFile(file, key);

				const addRes = await fetch(`/api/rooms/${roomId}/files/send`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: file.name,
						size: file.size,
						mimeType: file.type || "application/octet-stream",
						iv: ivBase64,
						keyBase64,
					}),
				});
				if (!addRes.ok) throw new Error("File registration failed");
				const { fileId, putUrl } = (await addRes.json()) as AddSendFileResponse;
				
				fileRecords.push({ fileId, putUrl, encryptedBlob, name: file.name, size: encryptedBlob.byteLength });
				totalUploadBytes += encryptedBlob.byteLength;
			}

			// Step 4: Upload to S3
			setPhase("uploading");
			let uploadedBytes = 0;
			const uploadPromises = fileRecords.map(async (record) => {
				let lastFileUploaded = 0;
				await uploadWithProgress(record.putUrl, record.encryptedBlob, (bytes, _total) => {
					uploadedBytes += (bytes - lastFileUploaded);
					lastFileUploaded = bytes;
					setProgress({ bytes: uploadedBytes, total: totalUploadBytes, percent: Math.round((uploadedBytes / totalUploadBytes) * 100) });
				});
			});
			await Promise.all(uploadPromises);

			const url = `${window.location.origin}/r/${roomId}`;
			setShareUrl(url);

			setPhase("waiting_for_peer");

			const ws = new WebSocket(`${WS_BASE}/api/room/${roomId}/ws?role=sender`);
			wsRef.current = ws;

			ws.onopen = () => {
				// We join using the first fileId for compatibility, RoomDO ignores it anyway
				const joinMsg: ClientMessage = { type: "join", role: "sender", fileId: fileRecords[0].fileId };
				ws.send(JSON.stringify(joinMsg));
			};

			ws.onmessage = async (event) => {
				let msg: ServerMessage;
				try { msg = JSON.parse(event.data as string) as ServerMessage; } catch { return; }

				if (msg.type === "peer_joined") {
					setPhase("p2p_connecting");
					let p2pBytes = 0;
					
					for (const record of fileRecords) {
						let lastSent = 0;
						const sender = setupSender(
							record.encryptedBlob,
							record.name,
							(payload) => {
								const sigMsg: ClientMessage = { type: "signal", payload, fileId: record.fileId };
								ws.send(JSON.stringify(sigMsg));
							},
							(bytes, _total) => {
								p2pBytes += (bytes - lastSent);
								lastSent = bytes;
								setProgress({ bytes: p2pBytes, total: totalUploadBytes, percent: Math.round((p2pBytes / totalUploadBytes) * 100) });
								setPhase("p2p_transferring");
							},
							(state) => {
								if (state === "connected") setPhase("p2p_transferring");
								if (state === "failed" || state === "disconnected") {
									doneRef.current = true;
									setPhase("done");
								}
							}
						);
						senderRefs.current.set(record.fileId, sender);
					}
				} else if (msg.type === "signal" && msg.fileId) {
					await senderRefs.current.get(msg.fileId)?.handleSignal(msg.payload);
				}
			};

			ws.onerror = () => {
				// WS error after upload — S3 fallback will work, treat as done
				doneRef.current = true;
				setPhase("done");
			};

			ws.onclose = () => {
				if (!doneRef.current) {
					doneRef.current = true;
					setPhase("done");
				}
			};
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setPhase("error");
		}
	}, []);

	return { phase, shareUrl, progress, error, send, reset };
}

// ─── Receive hook ─────────────────────────────────────────────────────────────

export interface UseReceiveTransferReturn {
	phase: ReceivePhase;
	filenames: string[];
	progress: TransferProgress;
	error: string | null;
	receive: (roomId: string) => Promise<void>;
	reset: () => void;
}

export function useReceiveTransfer(): UseReceiveTransferReturn {
	const [phase, setPhase] = useState<ReceivePhase>("idle");
	const [filenames, setFilenames] = useState<string[]>([]);
	const [progress, setProgress] = useState<TransferProgress>({
		bytes: 0,
		total: 0,
		percent: 0,
	});
	const [error, setError] = useState<string | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const receiverRefs = useRef<Map<string, {
		handleSignal: (p: RTCSignalPayload) => Promise<void>;
		result: Promise<{ blob: ArrayBuffer; filename: string }>;
		close: () => void;
	}>>(new Map());

	const reset = useCallback(() => {
		wsRef.current?.close();
		receiverRefs.current.forEach(r => r.close());
		receiverRefs.current.clear();
		wsRef.current = null;
		setPhase("idle");
		setFilenames([]);
		setProgress({ bytes: 0, total: 0, percent: 0 });
		setError(null);
	}, []);

	const receive = useCallback(async (roomId: string) => {
		try {
			setPhase("connecting");
			setError(null);

			const roomRes = await fetch(`/api/rooms/${roomId}/send`);
			if (!roomRes.ok) throw new Error("Room not found");
			const roomData = (await roomRes.json()) as SendRoomResponse;
			if (!roomData.files || roomData.files.length === 0) throw new Error("No files in room");

			setFilenames(roomData.files.map((f) => f.name));
			
			const keys = new Map<string, CryptoKey>();
			for (const f of roomData.files) {
				keys.set(f.fileId, await importKey(f.keyBase64));
			}

			setPhase("p2p_connecting");
			let p2pSucceeded = false;
			let totalBytes = roomData.files.reduce((acc, f) => acc + f.size, 0);

			try {
				await new Promise<void>((resolveP2P, rejectP2P) => {
					const ws = new WebSocket(`${WS_BASE}/api/room/${roomId}/ws?role=receiver`);
					wsRef.current = ws;

					let p2pReceivedBytes = 0;

					for (const roomFile of roomData.files) {
						let fileReceivedBytes = 0;
						const receiver = setupReceiver(
							(payload) => {
								const sigMsg: ClientMessage = { type: "signal", payload, fileId: roomFile.fileId };
								ws.send(JSON.stringify(sigMsg));
							},
							(bytes, _total) => {
								p2pReceivedBytes += (bytes - fileReceivedBytes);
								fileReceivedBytes = bytes;
								setProgress({ bytes: p2pReceivedBytes, total: totalBytes, percent: totalBytes > 0 ? Math.round((p2pReceivedBytes / totalBytes) * 100) : 0 });
								setPhase("p2p_receiving");
							},
							(state) => {
								if (state === "failed" || state === "disconnected") rejectP2P(new Error(`WebRTC ${state}`));
							}
						);
						receiverRefs.current.set(roomFile.fileId, receiver);
					}

					Promise.all(Array.from(receiverRefs.current.entries()).map(async ([fileId, receiver]) => {
						const { blob, filename: fname } = await receiver.result;
						const file = roomData.files.find(f => f.fileId === fileId)!;
						const plaintext = await decryptBlob(blob, keys.get(fileId)!);
						downloadBuffer(plaintext, fname, file.mimeType);
					})).then(() => {
						clearTimeout(p2pTimeoutId);
						p2pSucceeded = true;
						setPhase("done");
						ws.close();
						resolveP2P();
					}).catch(rejectP2P);

					ws.onopen = () => {
						const joinMsg: ClientMessage = { type: "join", role: "receiver", fileId: roomData.files[0].fileId };
						ws.send(JSON.stringify(joinMsg));
					};

					ws.onmessage = async (event) => {
						let msg: ServerMessage;
						try { msg = JSON.parse(event.data as string) as ServerMessage; } catch { return; }
						if (msg.type === "signal" && msg.fileId) {
							await receiverRefs.current.get(msg.fileId)?.handleSignal(msg.payload);
						} else if (msg.type === "sender_offline") {
							rejectP2P(new Error("Sender is offline"));
						}
					};

					ws.onerror = () => rejectP2P(new Error("WebSocket error"));
					const p2pTimeoutId = setTimeout(() => {
						if (!p2pSucceeded) rejectP2P(new Error("P2P timeout"));
					}, 20_000);
				});
			} catch (err) {
				wsRef.current?.close();
				receiverRefs.current.forEach(r => r.close());
				receiverRefs.current.clear();
				wsRef.current = null;
				
				if (p2pSucceeded) return;

				setPhase("fallback_downloading");
				setProgress({ bytes: 0, total: totalBytes, percent: 0 });

				let s3ReceivedBytes = 0;
				for (const roomFile of roomData.files) {
					const blobRes = await fetch(roomFile.getUrl);
					if (!blobRes.ok) throw new Error("S3 download failed");
					const encryptedBlob = await blobRes.arrayBuffer();
					
					s3ReceivedBytes += encryptedBlob.byteLength;
					setProgress({ bytes: s3ReceivedBytes, total: totalBytes, percent: Math.round((s3ReceivedBytes / totalBytes) * 100) });

					const plaintext = await decryptBlob(encryptedBlob, keys.get(roomFile.fileId)!);
					downloadBuffer(plaintext, roomFile.name, roomFile.mimeType);
				}
				setPhase("done");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setPhase("error");
		}
	}, []);

	return { phase, filenames, progress, error, receive, reset };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function uploadWithProgress(
	url: string,
	data: ArrayBuffer,
	onProgress: (bytes: number, total: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		xhr.setRequestHeader("Content-Type", "application/octet-stream");

		let lastPercent = -1;
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				const percent = Math.round((event.loaded / event.total) * 100);
				if (percent !== lastPercent) {
					lastPercent = percent;
					onProgress(event.loaded, event.total);
				}
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				resolve();
			} else {
				reject(new Error(`Upload failed: HTTP ${xhr.status}`));
			}
		};

		xhr.onerror = () => reject(new Error("Network error during upload"));
		xhr.ontimeout = () => reject(new Error("Upload timed out"));

		xhr.send(data);
	});
}
