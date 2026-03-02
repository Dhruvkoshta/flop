/**
 * usePersonalRoom.ts — Hooks for personal room create / upload / download / delete
 *
 * Personal rooms:
 *  - Created at /personal with alias + password + expiry
 *  - Accessible publicly at /u/:alias
 *  - Owner (authenticated by password hash) can add/delete files
 *  - AES-GCM-256 key stored server-side per file — no key in URL
 *  - Anyone can view file list and download + decrypt
 */

import type {
	AddPersonalFileResponse,
	CreatePersonalRoomResponse,
	PersonalFileDownloadState,
	PersonalFileUploadState,
	PersonalRoomResponse,
	PersonalUploadPhase,
} from "@flop/shared";
import { useCallback, useState } from "react";
import {
	decryptBlob,
	downloadBuffer,
	encryptFile,
	exportKey,
	generateKey,
	hashPassword,
	importKey,
} from "@/lib/crypto";

// ─── Create hook ──────────────────────────────────────────────────────────────

export interface CreatePersonalRoomOptions {
	alias: string;
	label?: string;
	password: string;
	expiresIn: 24 | 168 | 720;
}

export interface UsePersonalRoomCreateReturn {
	phase: "idle" | "creating" | "done" | "error";
	result: CreatePersonalRoomResponse | null;
	error: string | null;
	create: (opts: CreatePersonalRoomOptions) => Promise<void>;
	reset: () => void;
}

export function usePersonalRoomCreate(): UsePersonalRoomCreateReturn {
	const [phase, setPhase] = useState<"idle" | "creating" | "done" | "error">(
		"idle",
	);
	const [result, setResult] = useState<CreatePersonalRoomResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	const reset = useCallback(() => {
		setPhase("idle");
		setResult(null);
		setError(null);
	}, []);

	const create = useCallback(async (opts: CreatePersonalRoomOptions) => {
		try {
			setPhase("creating");
			setError(null);

			const passwordHash = await hashPassword(opts.password);

			const res = await fetch("/api/rooms/personal", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					alias: opts.alias,
					label: opts.label,
					passwordHash,
					expiresIn: opts.expiresIn,
				}),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({ error: "Creation failed" }));
				throw new Error((err as { error: string }).error);
			}

			const data = (await res.json()) as CreatePersonalRoomResponse;
			setResult(data);
			setPhase("done");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setPhase("error");
		}
	}, []);

	return { phase, result, error, create, reset };
}

// ─── Room view / upload / delete hook ────────────────────────────────────────

export interface UsePersonalRoomReturn {
	loadPhase: "idle" | "loading" | "ready" | "error";
	room: PersonalRoomResponse | null;
	loadError: string | null;
	loadRoom: (alias: string) => Promise<void>;

	// upload
	uploadPhase: PersonalUploadPhase;
	uploadStates: PersonalFileUploadState[];
	uploadError: string | null;
	uploadFiles: (
		files: File[],
		password: string,
		roomId: string,
	) => Promise<void>;
	resetUpload: () => void;

	// delete
	deleteFile: (
		fileId: string,
		password: string,
		roomId: string,
	) => Promise<void>;
}

export function usePersonalRoom(): UsePersonalRoomReturn {
	const [loadPhase, setLoadPhase] = useState<
		"idle" | "loading" | "ready" | "error"
	>("idle");
	const [room, setRoom] = useState<PersonalRoomResponse | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [uploadPhase, setUploadPhase] = useState<PersonalUploadPhase>("idle");
	const [uploadStates, setUploadStates] = useState<PersonalFileUploadState[]>(
		[],
	);
	const [uploadError, setUploadError] = useState<string | null>(null);

	const loadRoom = useCallback(async (alias: string) => {
		try {
			setLoadPhase("loading");
			setLoadError(null);

			const res = await fetch(`/api/rooms/personal/${alias}`);
			if (!res.ok) {
				const err = await res
					.json()
					.catch(() => ({ error: "Room not found" }));
				throw new Error((err as { error: string }).error);
			}

			const data = (await res.json()) as PersonalRoomResponse;
			setRoom(data);
			setLoadPhase("ready");
		} catch (err) {
			setLoadError(err instanceof Error ? err.message : "Unknown error");
			setLoadPhase("error");
		}
	}, []);

	const updateUploadFile = useCallback(
		(index: number, patch: Partial<PersonalFileUploadState>) => {
			setUploadStates((prev) => {
				const next = [...prev];
				next[index] = { ...(next[index] ?? {}), ...patch } as PersonalFileUploadState;
				return next;
			});
		},
		[],
	);

	const resetUpload = useCallback(() => {
		setUploadPhase("idle");
		setUploadStates([]);
		setUploadError(null);
	}, []);

	const uploadFiles = useCallback(
		async (files: File[], password: string, roomId: string) => {
			try {
				setUploadPhase("encrypting");
				setUploadError(null);

				const passwordHash = await hashPassword(password);

				const initialStates: PersonalFileUploadState[] = files.map((f) => ({
					file: f,
					fileId: null,
					phase: "pending",
					progress: { bytes: 0, total: f.size, percent: 0 },
					error: null,
				}));
				setUploadStates(initialStates);

				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					if (!file) continue;

					updateUploadFile(i, { phase: "encrypting" });

					const key = await generateKey();
					const keyBase64 = await exportKey(key);
					const { encryptedBlob, ivBase64 } = await encryptFile(file, key);

					updateUploadFile(i, {
						progress: { bytes: file.size, total: file.size, percent: 100 },
					});

					setUploadPhase("uploading");
					updateUploadFile(i, { phase: "uploading" });

					// Register file
					const addRes = await fetch(`/api/rooms/${roomId}/files/personal`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							name: file.name,
							size: file.size,
							mimeType: file.type || "application/octet-stream",
							iv: ivBase64,
							keyBase64,
							passwordHash,
						}),
					});

					if (!addRes.ok) {
						const err = await addRes
							.json()
							.catch(() => ({ error: "File registration failed" }));
						updateUploadFile(i, {
							phase: "error",
							error: (err as { error: string }).error,
						});
						continue;
					}

					const { fileId, putUrl } =
						(await addRes.json()) as AddPersonalFileResponse;
					updateUploadFile(i, {
						fileId,
						progress: { bytes: 0, total: encryptedBlob.byteLength, percent: 0 },
					});

					// Upload to S3
					await uploadWithProgress(putUrl, encryptedBlob, (bytes, total) => {
						updateUploadFile(i, {
							progress: {
								bytes,
								total,
								percent: total > 0 ? Math.round((bytes / total) * 100) : 0,
							},
						});
					});

					updateUploadFile(i, { phase: "done", fileId });
				}

				setUploadPhase("done");
			} catch (err) {
				setUploadError(err instanceof Error ? err.message : "Unknown error");
				setUploadPhase("error");
			}
		},
		[updateUploadFile],
	);

	const deleteFile = useCallback(
		async (fileId: string, password: string, roomId: string) => {
			const passwordHash = await hashPassword(password);

			const res = await fetch(`/api/rooms/${roomId}/files/${fileId}`, {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ passwordHash }),
			});

			if (!res.ok) {
				const err = await res
					.json()
					.catch(() => ({ error: "Delete failed" }));
				throw new Error((err as { error: string }).error);
			}

			// Remove from local state
			setRoom((prev) =>
				prev
					? { ...prev, files: prev.files.filter((f) => f.fileId !== fileId) }
					: prev,
			);
		},
		[],
	);

	return {
		loadPhase,
		room,
		loadError,
		loadRoom,
		uploadPhase,
		uploadStates,
		uploadError,
		uploadFiles,
		resetUpload,
		deleteFile,
	};
}

// ─── Download hook (for personal room files) ─────────────────────────────────

export interface UsePersonalDownloadReturn {
	fileStates: PersonalFileDownloadState[];
	initFiles: (room: PersonalRoomResponse) => void;
	toggleSelect: (fileId: string) => void;
	selectAll: () => void;
	deselectAll: () => void;
	downloadSelected: (room: PersonalRoomResponse) => Promise<void>;
}

export function usePersonalDownload(): UsePersonalDownloadReturn {
	const [fileStates, setFileStates] = useState<PersonalFileDownloadState[]>([]);

	const initFiles = useCallback((room: PersonalRoomResponse) => {
		setFileStates(
			room.files.map((f) => ({
				fileId: f.fileId,
				name: f.name,
				size: f.size,
				mimeType: f.mimeType,
				selected: true,
				phase: "idle",
				progress: { bytes: 0, total: f.size, percent: 0 },
				error: null,
			})),
		);
	}, []);

	const updateFile = useCallback(
		(fileId: string, patch: Partial<PersonalFileDownloadState>) => {
			setFileStates((prev) =>
				prev.map((f) => (f.fileId === fileId ? { ...f, ...patch } : f)),
			);
		},
		[],
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

	const downloadSelected = useCallback(
		async (room: PersonalRoomResponse) => {
			const selected = fileStates.filter((f) => f.selected);

			for (const fs of selected) {
				const roomFile = room.files.find((f) => f.fileId === fs.fileId);
				if (!roomFile) continue;

				try {
					updateFile(fs.fileId, { phase: "downloading" });

					const blobRes = await fetch(roomFile.getUrl);
					if (!blobRes.ok) throw new Error("Download failed");

					const encryptedBlob = await blobRes.arrayBuffer();
					updateFile(fs.fileId, {
						progress: {
							bytes: encryptedBlob.byteLength,
							total: encryptedBlob.byteLength,
							percent: 100,
						},
					});

					updateFile(fs.fileId, { phase: "decrypting" });
					const key = await importKey(roomFile.keyBase64);
					const plaintext = await decryptBlob(encryptedBlob, key);

					downloadBuffer(plaintext, roomFile.name, roomFile.mimeType);
					updateFile(fs.fileId, { phase: "done" });
				} catch (err) {
					const message = err instanceof Error ? err.message : "Download failed";
					updateFile(fs.fileId, { phase: "error", error: message });
				}
			}
		},
		[fileStates, updateFile],
	);

	return {
		fileStates,
		initFiles,
		toggleSelect,
		selectAll,
		deselectAll,
		downloadSelected,
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
