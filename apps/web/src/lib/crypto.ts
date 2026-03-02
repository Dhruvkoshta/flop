/**
 * crypto.ts — Client-side AES-GCM-256 encryption/decryption
 *
 * Zero-knowledge design:
 *  - All crypto operations run in the browser via Web Crypto API (SubtleCrypto).
 *  - The raw key bytes never leave the browser in plaintext.
 *  - Keys are embedded in the URL fragment (#keys=...) which is never sent to the server.
 *
 * Wire format for encrypted blobs:
 *  [ 12 bytes IV ][ N bytes AES-GCM ciphertext + 16-byte tag ]
 *  Total overhead: +28 bytes per file.
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV for AES-GCM
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ─── Key generation & serialisation ──────────────────────────────────────────

/**
 * Generate a fresh AES-GCM-256 key.
 * The key is marked extractable so we can export it for the URL fragment.
 */
export async function generateKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey(
		{ name: ALGORITHM, length: KEY_LENGTH },
		true, // extractable
		["encrypt", "decrypt"],
	);
}

/**
 * Export a CryptoKey to a URL-safe base64 string (no padding).
 * This string is appended to the share URL as part of the fragment.
 */
export async function exportKey(key: CryptoKey): Promise<string> {
	const raw = await crypto.subtle.exportKey("raw", key);
	return bufferToBase64url(raw);
}

/**
 * Import a base64url-encoded key back into a CryptoKey.
 * Called on the receiver side when parsing the URL fragment.
 */
export async function importKey(base64url: string): Promise<CryptoKey> {
	const raw = base64urlToBuffer(base64url);
	return crypto.subtle.importKey(
		"raw",
		raw.buffer as ArrayBuffer,
		{ name: ALGORITHM, length: KEY_LENGTH },
		false,
		["decrypt"],
	);
}

// ─── Encryption ───────────────────────────────────────────────────────────────

export interface EncryptResult {
	/** 12-byte IV (also prepended to encryptedBlob for transport) */
	iv: Uint8Array;
	/** Full wire-format blob: [12-byte IV][ciphertext+tag] */
	encryptedBlob: ArrayBuffer;
	/** base64url-encoded IV — sent to server as metadata so it can be stored */
	ivBase64: string;
}

/**
 * Encrypt a File object using AES-GCM-256.
 * Returns the IV separately and the full wire-format blob (IV prepended).
 *
 * @throws if file exceeds 100 MB
 */
export async function encryptFile(
	file: File,
	key: CryptoKey,
): Promise<EncryptResult> {
	if (file.size > MAX_FILE_SIZE) {
		throw new Error(
			`File exceeds maximum size of 100 MB (got ${file.size} bytes)`,
		);
	}

	const plaintext = await file.arrayBuffer();
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

	const ciphertext = await crypto.subtle.encrypt(
		{ name: ALGORITHM, iv },
		key,
		plaintext,
	);

	// Prepend IV to ciphertext for the wire format
	const encryptedBlob = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
	encryptedBlob.set(iv, 0);
	encryptedBlob.set(new Uint8Array(ciphertext), IV_LENGTH);

	return {
		iv,
		encryptedBlob: encryptedBlob.buffer as ArrayBuffer,
		ivBase64: bufferToBase64url(iv),
	};
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Decrypt an encrypted blob.
 * Accepts the full wire-format blob with IV prepended.
 *
 * @param encryptedBlobWithIV  Full wire-format: [12-byte IV][ciphertext]
 * @param key                  AES-GCM-256 CryptoKey
 * @returns Decrypted plaintext ArrayBuffer
 */
export async function decryptBlob(
	encryptedBlobWithIV: ArrayBuffer,
	key: CryptoKey,
): Promise<ArrayBuffer> {
	const data = new Uint8Array(encryptedBlobWithIV);

	if (data.length <= IV_LENGTH) {
		throw new Error("Encrypted blob is too short to contain IV + ciphertext");
	}

	const iv = data.slice(0, IV_LENGTH);
	const ciphertext = data.slice(IV_LENGTH);

	return crypto.subtle.decrypt(
		{ name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
		key,
		ciphertext.buffer as ArrayBuffer,
	);
}

/**
 * Decrypt using a separately stored IV (base64url) and ciphertext ArrayBuffer.
 */
export async function decryptWithIv(
	ciphertext: ArrayBuffer,
	ivBase64: string,
	key: CryptoKey,
): Promise<ArrayBuffer> {
	const iv = base64urlToBuffer(ivBase64);
	return crypto.subtle.decrypt(
		{ name: ALGORITHM, iv: iv.buffer as ArrayBuffer },
		key,
		ciphertext,
	);
}

// ─── Room URL helpers ─────────────────────────────────────────────────────────

/**
 * Build the share URL for a room.
 * The key is NEVER sent to the server — it lives in the URL fragment.
 *
 * @param roomId   The room ID
 * @param origin   Override origin (defaults to window.location.origin)
 */
export function buildRoomUrl(roomId: string, origin?: string): string {
	const base = origin ?? window.location.origin;
	return `${base}/r/${roomId}`;
}

/**
 * Build the full share URL for a single file transfer (legacy).
 */
export function buildShareUrl(
	fileId: string,
	keyBase64: string,
	origin?: string,
): string {
	const base = origin ?? window.location.origin;
	return `${base}/d/${fileId}#key=${keyBase64}`;
}

/**
 * Parse fileId and key from the current URL (legacy single-file).
 */
export function parseShareUrl(): { fileId: string; keyBase64: string } | null {
	const pathParts = window.location.pathname.split("/");
	const fileId = pathParts[pathParts.length - 1];
	if (!fileId) return null;

	const fragment = window.location.hash.slice(1);
	const params = new URLSearchParams(fragment);
	const keyBase64 = params.get("key");
	if (!keyBase64) return null;

	return { fileId, keyBase64 };
}

// ─── Base64url helpers ────────────────────────────────────────────────────────

export function bufferToBase64url(buffer: ArrayBuffer | Uint8Array): string {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function base64urlToBuffer(base64url: string): Uint8Array {
	// Restore standard base64 padding
	const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(
		base64.length + ((4 - (base64.length % 4)) % 4),
		"=",
	);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

/**
 * Trigger a browser file download from an ArrayBuffer.
 */
export function downloadBuffer(
	buffer: ArrayBuffer,
	filename: string,
	mimeType: string,
): void {
	const blob = new Blob([buffer], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.style.display = "none";
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Hash a password string with SHA-256, returning a lowercase hex string.
 * This is what gets sent to the server as passwordHash.
 */
export async function hashPassword(password: string): Promise<string> {
	const encoded = new TextEncoder().encode(password);
	const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
