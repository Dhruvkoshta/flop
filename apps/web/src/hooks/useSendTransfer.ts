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
import { useCallback, useRef, useState } from "react";
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
	send: (file: File) => Promise<void>;
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
	const senderRef = useRef<{ handleSignal: (p: RTCSignalPayload) => Promise<void>; close: () => void } | null>(null);
	const doneRef = useRef(false);

	const reset = useCallback(() => {
		wsRef.current?.close();
		senderRef.current?.close();
		wsRef.current = null;
		senderRef.current = null;
		doneRef.current = false;
		setPhase("idle");
		setShareUrl(null);
		setProgress({ bytes: 0, total: 0, percent: 0 });
		setError(null);
	}, []);

	const send = useCallback(async (file: File) => {
		try {
			setPhase("encrypting");
			setError(null);

			// Step 1: Generate key + encrypt
			const key = await generateKey();
			const keyBase64 = await exportKey(key);
			const { encryptedBlob, ivBase64 } = await encryptFile(file, key);

			// Step 2: Create send room
			const createRes = await fetch("/api/rooms/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ expiresIn: 24 }),
			});
			if (!createRes.ok) {
				const err = await createRes
					.json()
					.catch(() => ({ error: "Room creation failed" }));
				throw new Error((err as { error: string }).error);
			}
			const { roomId } = (await createRes.json()) as CreateSendRoomResponse;

			// Step 3: Register file (include key — stored server-side)
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
			if (!addRes.ok) {
				const err = await addRes
					.json()
					.catch(() => ({ error: "File registration failed" }));
				throw new Error((err as { error: string }).error);
			}
			const { fileId, putUrl } = (await addRes.json()) as AddSendFileResponse;

			// Step 4: Upload to S3
			setPhase("uploading");
			await uploadWithProgress(putUrl, encryptedBlob, (bytes, total) => {
				setProgress({
					bytes,
					total,
					percent: total > 0 ? Math.round((bytes / total) * 100) : 0,
				});
			});

			// Build share URL — no fragment needed, key is stored server-side
			const url = `${window.location.origin}/r/${roomId}`;
			setShareUrl(url);

			// Step 5: Open WebSocket, wait for receiver
			setPhase("waiting_for_peer");

			const ws = new WebSocket(`${WS_BASE}/api/room/${roomId}/ws?role=sender`);
			wsRef.current = ws;

			ws.onopen = () => {
				const joinMsg: ClientMessage = {
					type: "join",
					role: "sender",
					fileId,
				};
				ws.send(JSON.stringify(joinMsg));
			};

			ws.onmessage = async (event) => {
				let msg: ServerMessage;
				try {
					msg = JSON.parse(event.data as string) as ServerMessage;
				} catch {
					return;
				}

				if (msg.type === "peer_joined") {
					// Receiver connected — attempt P2P
					setPhase("p2p_connecting");

					const sender = setupSender(
						encryptedBlob,
						file.name,
						(payload) => {
							const sigMsg: ClientMessage = { type: "signal", payload, fileId };
							ws.send(JSON.stringify(sigMsg));
						},
						(bytes, total) => {
							setProgress({
								bytes,
								total,
								percent: total > 0 ? Math.round((bytes / total) * 100) : 0,
							});
							setPhase("p2p_transferring");
						},
						(state) => {
							if (state === "connected") setPhase("p2p_transferring");
							if (state === "failed" || state === "disconnected") {
								// P2P failed — receiver will fall back to S3; we're done
								doneRef.current = true;
								setPhase("done");
							}
						},
					);
					senderRef.current = sender;
				} else if (msg.type === "signal") {
					await senderRef.current?.handleSignal(msg.payload);
				} else if (msg.type === "joined") {
					// Our own join confirmed
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
	filename: string | null;
	progress: TransferProgress;
	error: string | null;
	receive: (roomId: string) => Promise<void>;
	reset: () => void;
}

export function useReceiveTransfer(): UseReceiveTransferReturn {
	const [phase, setPhase] = useState<ReceivePhase>("idle");
	const [filename, setFilename] = useState<string | null>(null);
	const [progress, setProgress] = useState<TransferProgress>({
		bytes: 0,
		total: 0,
		percent: 0,
	});
	const [error, setError] = useState<string | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const receiverRef = useRef<{
		handleSignal: (p: RTCSignalPayload) => Promise<void>;
		result: Promise<{ blob: ArrayBuffer; filename: string }>;
		close: () => void;
	} | null>(null);

	const reset = useCallback(() => {
		wsRef.current?.close();
		receiverRef.current?.close();
		wsRef.current = null;
		receiverRef.current = null;
		setPhase("idle");
		setFilename(null);
		setProgress({ bytes: 0, total: 0, percent: 0 });
		setError(null);
	}, []);

	const receive = useCallback(async (roomId: string) => {
		try {
			setPhase("connecting");
			setError(null);

			// Fetch room metadata — key is stored server-side
			const roomRes = await fetch(`/api/rooms/${roomId}/send`);
			if (!roomRes.ok) {
				const err = await roomRes
					.json()
					.catch(() => ({ error: "Room not found" }));
				throw new Error((err as { error: string }).error);
			}
			const roomData = (await roomRes.json()) as SendRoomResponse;
			const roomFile = roomData.files[0];
			if (!roomFile) throw new Error("No file in room");

			setFilename(roomFile.name);

			// Import the key from the server response
			const key = await importKey(roomFile.keyBase64);

			// Try WebRTC P2P first
			setPhase("p2p_connecting");

			let p2pSucceeded = false;

			try {
				await new Promise<void>((resolveP2P, rejectP2P) => {
					const ws = new WebSocket(`${WS_BASE}/api/room/${roomId}/ws?role=receiver`);
					wsRef.current = ws;

					const receiver = setupReceiver(
						(payload) => {
							const sigMsg: ClientMessage = {
								type: "signal",
								payload,
								fileId: roomFile.fileId,
							};
							ws.send(JSON.stringify(sigMsg));
						},
						(bytes, total) => {
							setProgress({
								bytes,
								total,
								percent: total > 0 ? Math.round((bytes / total) * 100) : 0,
							});
							setPhase("p2p_receiving");
						},
						(state) => {
							if (state === "failed" || state === "disconnected") {
								rejectP2P(new Error(`WebRTC ${state}`));
							}
						},
					);
					receiverRef.current = receiver;

					// Handle P2P result
					receiver.result
						.then(async ({ blob, filename: fname }) => {
							setPhase("decrypting");
							const plaintext = await decryptBlob(blob, key);
							downloadBuffer(plaintext, fname, roomFile.mimeType);
							p2pSucceeded = true;
							setPhase("done");
							ws.close();
							resolveP2P();
						})
						.catch(rejectP2P);

					ws.onopen = () => {
						const joinMsg: ClientMessage = {
							type: "join",
							role: "receiver",
							fileId: roomFile.fileId,
						};
						ws.send(JSON.stringify(joinMsg));
					};

					ws.onmessage = async (event) => {
						let msg: ServerMessage;
						try {
							msg = JSON.parse(event.data as string) as ServerMessage;
						} catch {
							return;
						}

						if (msg.type === "signal") {
							await receiver.handleSignal(msg.payload);
						} else if (msg.type === "sender_offline") {
							rejectP2P(new Error("Sender is offline"));
						} else if (msg.type === "joined" && !msg.senderOnline) {
							// Sender not present — skip to fallback
							rejectP2P(new Error("Sender not online"));
						}
					};

					ws.onerror = () => rejectP2P(new Error("WebSocket error"));

					// Timeout: if no progress after 20s, fall back
					setTimeout(() => {
						if (!p2pSucceeded) {
							rejectP2P(new Error("P2P timeout"));
						}
					}, 20_000);
				});
			} catch {
				// P2P failed — fall back to S3
				wsRef.current?.close();
				receiverRef.current?.close();
				wsRef.current = null;
				receiverRef.current = null;

				if (p2pSucceeded) return; // Already done

				setPhase("fallback_downloading");
				setProgress({ bytes: 0, total: roomFile.size, percent: 0 });

				const blobRes = await fetch(roomFile.getUrl);
				if (!blobRes.ok) throw new Error("S3 download failed");

				const encryptedBlob = await blobRes.arrayBuffer();
				setProgress({
					bytes: encryptedBlob.byteLength,
					total: encryptedBlob.byteLength,
					percent: 100,
				});

				setPhase("decrypting");
				const plaintext = await decryptBlob(encryptedBlob, key);
				downloadBuffer(plaintext, roomFile.name, roomFile.mimeType);
				setPhase("done");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setPhase("error");
		}
	}, []);

	return { phase, filename, progress, error, receive, reset };
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

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				onProgress(event.loaded, event.total);
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
