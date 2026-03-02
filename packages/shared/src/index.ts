// ─── API Request / Response Types ──────────────────────────────────────────

/** Create a new room with policies */
export interface CreateRoomRequest {
  /** Optional label shown to recipients */
  label?: string;
  /** Hours until expiry: 1–168 for send rooms, 168/720 for personal rooms (default 24h) */
  expiresIn?: number;
  /** If true, recipients can only download files once */
  oneTimeDownload?: boolean;
  /** Optional password hash for room access (SHA-256 hex, computed client-side) */
  passwordHash?: string;
  /** Optional alias to register (e.g. "dhruv" → /u/dhruv) */
  alias?: string;
}

export interface CreateRoomResponse {
  roomId: string;
  expiresAt: string;
  /** Set if an alias was registered */
  alias?: string;
}

/** Verify room password */
export interface VerifyPasswordRequest {
  passwordHash: string;
}

/** Resolve alias → roomId */
export interface AliasResolveResponse {
  alias: string;
  roomId: string;
  expiresAt: string | null;
}

/** Add a file to a room — metadata only, returns presigned PUT URL */
export interface AddFileRequest {
  roomId: string;
  name: string;
  size: number;
  mimeType: string;
  /** IV as base64url — generated client-side */
  iv: string;
  /** Per-file AES-GCM-256 key as base64url — stored room-side so the room link carries all keys */
  keyBase64: string;
}

export interface AddFileResponse {
  fileId: string;
  putUrl: string;
  expiresAt: string;
}

/** Single file entry inside a room listing */
export interface RoomFile {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  iv: string;
  /** base64url key for this file */
  keyBase64: string;
  getUrl: string;
  downloadCount: number;
  createdAt: string;
}

/** GET /api/room/:roomId — room metadata + file list */
export interface RoomMetaResponse {
  roomId: string;
  label: string | null;
  alias: string | null;
  oneTimeDownload: boolean;
  hasPassword: boolean;
  expiresAt: string;
  files: RoomFile[];
}

// Legacy single-file types kept for reference during migration

export interface UploadRequest {
  name: string;
  size: number;
  mimeType: string;
  /** IV as base64url — generated client-side, sent so server can store it */
  iv: string;
}

export interface UploadResponse {
  fileId: string;
  roomId: string;
  putUrl: string;
  /** ISO timestamp when file expires */
  expiresAt: string;
}

export interface FileMetaResponse {
  fileId: string;
  name: string;
  size: number;
  encryptedSize?: number;
  mimeType: string;
  iv: string;
  getUrl: string;
  expiresAt: string;
}

export interface ErrorResponse {
  error: string;
  code?: string;
}

// ─── WebSocket / Signaling Message Types ───────────────────────────────────

export type PeerRole = "sender" | "receiver";

// Messages sent from Client → Server (RoomDO)
export type ClientMessage =
  | { type: "join"; role: PeerRole; fileId: string }
  | { type: "signal"; payload: RTCSignalPayload; fileId?: string }
  | { type: "ping" }
  | { type: "leave" };

// Messages sent from Server (RoomDO) → Client
export type ServerMessage =
  | { type: "joined"; role: PeerRole; peersOnline: number; senderOnline: boolean }
  | { type: "peer_joined"; role: PeerRole; senderOnline: boolean }
  | { type: "signal"; payload: RTCSignalPayload; fileId?: string }
  | { type: "sender_offline" }
  | { type: "pong" }
  | { type: "error"; message: string };

export type RTCSignalPayload =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit };

// ─── Transfer State Machine ─────────────────────────────────────────────────

export type UploadState =
  | "idle"
  | "encrypting"
  | "uploading"
  | "waiting_for_peer"
  | "p2p_connecting"
  | "p2p_transferring"
  | "done"
  | "error";

export type DownloadState =
  | "idle"
  | "connecting"
  | "p2p_connecting"
  | "p2p_receiving"
  | "fallback_downloading"
  | "decrypting"
  | "done"
  | "error";

export interface TransferProgress {
  /** Bytes transferred so far */
  bytes: number;
  /** Total bytes expected (0 if unknown) */
  total: number;
  /** 0–100 */
  percent: number;
}

// ─── Room Upload State ───────────────────────────────────────────────────────

export type RoomUploadPhase =
  | "idle"
  | "creating_room"
  | "encrypting"
  | "uploading"
  | "done"
  | "error";

export interface RoomFileUploadState {
  file: File;
  fileId: string | null;
  keyBase64: string | null;
  phase: "pending" | "encrypting" | "uploading" | "done" | "error";
  progress: TransferProgress;
  error: string | null;
}

// ─── Room Download State ─────────────────────────────────────────────────────

export type RoomDownloadPhase =
  | "idle"
  | "loading"
  | "ready"
  | "downloading"
  | "done"
  | "error";

export interface RoomFileDownloadState {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  selected: boolean;
  phase: "idle" | "downloading" | "decrypting" | "done" | "error";
  progress: TransferProgress;
  error: string | null;
}

// ─── Room State ─────────────────────────────────────────────────────────────

export type RoomStatus = "waiting" | "connected" | "transferring" | "done";

export interface RoomRecord {
  roomId: string;
  fileId: string;
  status: RoomStatus;
  senderOnline: boolean;
  createdAt: number;
  expiresAt: number;
}
