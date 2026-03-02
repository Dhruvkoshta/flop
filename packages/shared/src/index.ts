// ─── Room types ───────────────────────────────────────────────────────────────

/**
 * "personal" — owner-managed room accessible at /u/:alias.
 *   Keys stored server-side; anyone can download, owner (via password) can upload/delete.
 *
 * "send" — ephemeral one-shot transfer room at /r/:roomId.
 *   Decryption key lives only in the URL fragment; server never sees it.
 *   Transfer uses WebRTC P2P with S3 fallback.
 */
export type RoomMode = "personal" | "send";

// ─── Personal Room API Types ──────────────────────────────────────────────────

export interface CreatePersonalRoomRequest {
  alias: string;           // e.g. "dhruv" → /u/dhruv
  label?: string;          // display title shown on the room page
  passwordHash: string;    // SHA-256 hex of the owner password (required)
  expiresIn: number;       // hours: 24 | 168 | 720
}

export interface CreatePersonalRoomResponse {
  roomId: string;
  alias: string;
  expiresAt: string;
}

/** Add a file to a personal room (owner-only, password required) */
export interface AddPersonalFileRequest {
  name: string;
  size: number;
  mimeType: string;
  iv: string;          // base64url IV generated client-side
  keyBase64: string;   // base64url AES-GCM-256 key stored server-side
  passwordHash: string; // proves ownership
}

export interface AddPersonalFileResponse {
  fileId: string;
  putUrl: string;
  expiresAt: string;
}

/** A single file entry on a personal room page */
export interface PersonalRoomFile {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  iv: string;
  keyBase64: string;
  getUrl: string;
  downloadCount: number;
  createdAt: string;
}

/** GET /api/rooms/:roomId — personal room metadata + file list (public) */
export interface PersonalRoomResponse {
  roomId: string;
  alias: string;
  label: string | null;
  expiresAt: string;
  files: PersonalRoomFile[];
}

// ─── Send Room API Types ──────────────────────────────────────────────────────

/**
 * Create an ephemeral send room.
 */
export interface CreateSendRoomRequest {
  expiresIn?: number; // hours, default 24
}

export interface CreateSendRoomResponse {
  roomId: string;
  expiresAt: string;
}

/**
 * Register a file in a send room — key stored server-side.
 * "send" — ephemeral one-shot transfer room at /r/:roomId.
 *   Decryption key is stored server-side; anyone with the link can download.
 *   Transfer uses WebRTC P2P with S3 fallback.
 */
export interface AddSendFileRequest {
  name: string;
  size: number;
  mimeType: string;
  iv: string;        // base64url IV generated client-side
  keyBase64: string; // base64url AES-GCM-256 key — stored server-side
}

export interface AddSendFileResponse {
  fileId: string;
  putUrl: string;
  expiresAt: string;
}

/** GET /api/rooms/:roomId/send — send room metadata + file list */
export interface SendRoomFile {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  iv: string;
  keyBase64: string; // stored server-side; returned to receiver for decryption
  getUrl: string;
}

export interface SendRoomResponse {
  roomId: string;
  expiresAt: string;
  files: SendRoomFile[];
}

// ─── Shared error type ────────────────────────────────────────────────────────

export interface ErrorResponse {
  error: string;
  code?: string;
}

// ─── Alias resolution ─────────────────────────────────────────────────────────

export interface AliasResolveResponse {
  alias: string;
  roomId: string;
  expiresAt: string | null;
}

// ─── WebSocket / Signaling Message Types ────────────────────────────────────

export type PeerRole = "sender" | "receiver";

// Client → Server (RoomDO)
export type ClientMessage =
  | { type: "join"; role: PeerRole; fileId: string }
  | { type: "signal"; payload: RTCSignalPayload; fileId?: string }
  | { type: "ping" }
  | { type: "leave" };

// Server (RoomDO) → Client
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

// ─── Transfer State Machines ─────────────────────────────────────────────────

export type SendPhase =
  | "idle"
  | "encrypting"
  | "uploading"          // uploading to S3
  | "waiting_for_peer"   // waiting for receiver to connect via WS
  | "p2p_connecting"
  | "p2p_transferring"
  | "done"
  | "error";

export type ReceivePhase =
  | "idle"
  | "connecting"
  | "p2p_connecting"
  | "p2p_receiving"
  | "fallback_downloading"
  | "decrypting"
  | "done"
  | "error";

export interface TransferProgress {
  bytes: number;
  total: number;
  percent: number;
}

// ─── Personal Room Upload State ───────────────────────────────────────────────

export type PersonalUploadPhase =
  | "idle"
  | "encrypting"
  | "uploading"
  | "done"
  | "error";

export interface PersonalFileUploadState {
  file: File;
  fileId: string | null;
  phase: "pending" | "encrypting" | "uploading" | "done" | "error";
  progress: TransferProgress;
  error: string | null;
}

// ─── Personal Room Download State ────────────────────────────────────────────

export interface PersonalFileDownloadState {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  selected: boolean;
  phase: "idle" | "downloading" | "decrypting" | "done" | "error";
  progress: TransferProgress;
  error: string | null;
}
