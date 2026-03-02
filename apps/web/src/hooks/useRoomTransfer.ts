/**
 * useRoomTransfer.ts — React hooks for room-based multi-file upload/download
 *
 * Upload flow:
 *   1. User selects files + sets policies (oneTimeDownload, expiry, label)
 *   2. Create room via POST /api/rooms
 *   3. For each file: generate key, encrypt in-browser, POST /api/rooms/:id/files, PUT to S3
 *   4. Room link = /r/:roomId (no keys in URL — keys stored server-side per-file)
 *
 * Download flow:
 *   1. GET /api/rooms/:roomId — fetch file list (includes per-file keys + presigned GET URLs)
 *   2. User selects files to download
 *   3. For each selected file: fetch encrypted blob, decrypt with per-file key, trigger download
 */

import type {
	AddFileResponse,
	CreateRoomResponse,
	RoomDownloadPhase,
	RoomFileDownloadState,
	RoomFileUploadState,
	RoomMetaResponse,
	RoomUploadPhase,
} from "@flop/shared";
import { useCallback, useState } from "react";
import {
	decryptBlob,
	downloadBuffer,
	encryptFile,
	exportKey,
	generateKey,
	importKey,
} from "@/lib/crypto";

// ─── Upload hook ──────────────────────────────────────────────────────────────

export interface RoomPolicy {
	label?: string;
	expiresIn?: number; // hours 1–168
	oneTimeDownload?: boolean;
}

export interface UseRoomUploadReturn {
	phase: RoomUploadPhase;
	roomId: string | null;
	roomUrl: string | null;
	fileStates: RoomFileUploadState[];
	error: string | null;
	createRoomAndUpload: (files: File[], policy: RoomPolicy) => Promise<void>;
	reset: () => void;
}

export function useRoomUpload(): UseRoomUploadReturn {
	const [phase, setPhase] = useState<RoomUploadPhase>("idle");
	const [roomId, setRoomId] = useState<string | null>(null);
	const [roomUrl, setRoomUrl] = useState<string | null>(null);
	const [fileStates, setFileStates] = useState<RoomFileUploadState[]>([]);
	const [error, setError] = useState<string | null>(null);

	const reset = useCallback(() => {
		setPhase("idle");
		setRoomId(null);
		setRoomUrl(null);
		setFileStates([]);
		setError(null);
	}, []);

	const updateFile = useCallback(
		(index: number, patch: Partial<RoomFileUploadState>) => {
			setFileStates((prev) => {
				const next = [...prev];
				next[index] = {
					...(next[index] ?? {}),
					...patch,
				} as RoomFileUploadState;
				return next;
			});
		},
		[],
	);

	const createRoomAndUpload = useCallback(
		async (files: File[], policy: RoomPolicy) => {
			try {
				reset();

				// Initialise file state
				const initialStates: RoomFileUploadState[] = files.map((f) => ({
					file: f,
					fileId: null,
					keyBase64: null,
					phase: "pending",
					progress: { bytes: 0, total: f.size, percent: 0 },
					error: null,
				}));
				setFileStates(initialStates);

				// ── Step 1: Create room ──────────────────────────────────────────────
				setPhase("creating_room");
				const createRes = await fetch("/api/rooms", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						label: policy.label,
						expiresIn: policy.expiresIn ?? 24,
						oneTimeDownload: policy.oneTimeDownload ?? false,
					}),
				});

				if (!createRes.ok) {
					const err = await createRes
						.json()
						.catch(() => ({ error: "Room creation failed" }));
					throw new Error((err as { error: string }).error);
				}

				const { roomId: newRoomId } =
					(await createRes.json()) as CreateRoomResponse;
				setRoomId(newRoomId);
				setRoomUrl(`${window.location.origin}/r/${newRoomId}`);

				setPhase("encrypting");

				// ── Step 2: Encrypt + upload each file ──────────────────────────────
				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					if (!file) continue;

					// Encrypt
					updateFile(i, { phase: "encrypting" });
					const key = await generateKey();
					const keyBase64 = await exportKey(key);
					const { encryptedBlob, ivBase64 } = await encryptFile(file, key);

					updateFile(i, {
						keyBase64,
						progress: { bytes: file.size, total: file.size, percent: 100 },
					});

					// Register file in room → get presigned PUT URL
					const addRes = await fetch(`/api/rooms/${newRoomId}/files`, {
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
						updateFile(i, {
							phase: "error",
							error: (err as { error: string }).error,
						});
						continue;
					}

					const { fileId, putUrl } = (await addRes.json()) as AddFileResponse;
					updateFile(i, {
						fileId,
						phase: "uploading",
						progress: { bytes: 0, total: encryptedBlob.byteLength, percent: 0 },
					});

					// Upload to S3
					setPhase("uploading");
					await uploadWithProgress(putUrl, encryptedBlob, (bytes, total) => {
						updateFile(i, {
							progress: {
								bytes,
								total,
								percent: total > 0 ? Math.round((bytes / total) * 100) : 0,
							},
						});
					});

					updateFile(i, { phase: "done" });
				}

				setPhase("done");
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(message);
				setPhase("error");
			}
		},
		[reset, updateFile],
	);

	return {
		phase,
		roomId,
		roomUrl,
		fileStates,
		error,
		createRoomAndUpload,
		reset,
	};
}

// ─── Download hook ────────────────────────────────────────────────────────────

export interface UseRoomDownloadReturn {
	phase: RoomDownloadPhase;
	roomMeta: RoomMetaResponse | null;
	fileStates: RoomFileDownloadState[];
	error: string | null;
	loadRoom: (roomId: string) => Promise<void>;
	toggleSelect: (fileId: string) => void;
	selectAll: () => void;
	deselectAll: () => void;
	downloadSelected: () => Promise<void>;
	reset: () => void;
}

export function useRoomDownload(): UseRoomDownloadReturn {
	const [phase, setPhase] = useState<RoomDownloadPhase>("idle");
	const [roomMeta, setRoomMeta] = useState<RoomMetaResponse | null>(null);
	const [fileStates, setFileStates] = useState<RoomFileDownloadState[]>([]);
	const [error, setError] = useState<string | null>(null);

	const reset = useCallback(() => {
		setPhase("idle");
		setRoomMeta(null);
		setFileStates([]);
		setError(null);
	}, []);

	const updateFile = useCallback(
		(fileId: string, patch: Partial<RoomFileDownloadState>) => {
			setFileStates((prev) =>
				prev.map((f) => (f.fileId === fileId ? { ...f, ...patch } : f)),
			);
		},
		[],
	);

	const loadRoom = useCallback(
		async (rid: string) => {
			try {
				reset();
				setPhase("loading");

				const res = await fetch(`/api/rooms/${rid}`);
				if (!res.ok) {
					const err = await res
						.json()
						.catch(() => ({ error: "Room not found" }));
					throw new Error((err as { error: string }).error);
				}

				const meta = (await res.json()) as RoomMetaResponse;
				setRoomMeta(meta);

				const states: RoomFileDownloadState[] = meta.files.map((f) => ({
					fileId: f.fileId,
					name: f.name,
					size: f.size,
					mimeType: f.mimeType,
					selected: true,
					phase: "idle",
					progress: { bytes: 0, total: f.size, percent: 0 },
					error: null,
				}));
				setFileStates(states);
				setPhase("ready");
			} catch (err) {
				const message = err instanceof Error ? err.message : "Unknown error";
				setError(message);
				setPhase("error");
			}
		},
		[reset],
	);

	const toggleSelect = useCallback((fileId: string) => {
		setFileStates((prev) =>
			prev.map((f) =>
				f.fileId === fileId ? { ...f, selected: !f.selected } : f,
			),
		);
	}, []);

	const selectAll = useCallback(() => {
		setFileStates((prev) => prev.map((f) => ({ ...f, selected: true })));
	}, []);

	const deselectAll = useCallback(() => {
		setFileStates((prev) => prev.map((f) => ({ ...f, selected: false })));
	}, []);

	const downloadSelected = useCallback(async () => {
		if (!roomMeta) return;
		setPhase("downloading");

		const selected = fileStates.filter((f) => f.selected);

		for (const fileState of selected) {
			const roomFile = roomMeta.files.find(
				(f) => f.fileId === fileState.fileId,
			);
			if (!roomFile) continue;

			try {
				updateFile(fileState.fileId, { phase: "downloading" });

				// Notify server of download (for one-time download tracking)
				await fetch(
					`/api/rooms/${roomMeta.roomId}/files/${fileState.fileId}/download`,
					{
						method: "POST",
					},
				);

				// Fetch encrypted blob
				const blobRes = await fetch(roomFile.getUrl);
				if (!blobRes.ok) throw new Error("Download failed");

				const encryptedBlob = await blobRes.arrayBuffer();
				updateFile(fileState.fileId, {
					progress: {
						bytes: encryptedBlob.byteLength,
						total: encryptedBlob.byteLength,
						percent: 100,
					},
				});

				// Decrypt
				updateFile(fileState.fileId, { phase: "decrypting" });
				const key = await importKey(roomFile.keyBase64);
				const plaintext = await decryptBlob(encryptedBlob, key);

				// Trigger browser download
				downloadBuffer(plaintext, roomFile.name, roomFile.mimeType);
				updateFile(fileState.fileId, { phase: "done" });
			} catch (err) {
				const message = err instanceof Error ? err.message : "Download failed";
				updateFile(fileState.fileId, { phase: "error", error: message });
			}
		}

		setPhase("done");
	}, [roomMeta, fileStates, updateFile]);

	return {
		phase,
		roomMeta,
		fileStates,
		error,
		loadRoom,
		toggleSelect,
		selectAll,
		deselectAll,
		downloadSelected,
		reset,
	};
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
