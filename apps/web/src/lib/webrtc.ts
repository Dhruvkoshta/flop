/**
 * webrtc.ts — WebRTC data channel file transfer helpers
 *
 * Strategy:
 *  - Sender creates offer → signals via RoomDO WebSocket
 *  - Receiver creates answer → signals back
 *  - Once data channel opens, sender streams the encrypted blob in 16KB chunks
 *  - A small JSON header frame is sent first with { size, filename }
 *  - Receiver reassembles chunks then returns the full ArrayBuffer
 *
 * The file transferred is already encrypted — WebRTC is just the transport.
 */

import type { RTCSignalPayload } from "@flop/shared";

// ─── Constants ────────────────────────────────────────────────────────────────

/** STUN servers for NAT traversal. ~80% coverage without TURN. */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

/** Data channel chunk size: 16KB — safe for all browsers */
const CHUNK_SIZE = 16 * 1024;

/** Timeout for ICE/connection establishment (ms) */
const CONNECTION_TIMEOUT = 15_000;

/** Backpressure threshold: pause sending when buffer exceeds this */
const BUFFER_HIGH_WATER = 1024 * 1024; // 1 MB

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignalSender = (payload: RTCSignalPayload) => void;
export type ProgressCallback = (bytes: number, total: number) => void;
export type ConnectionStateCallback = (state: RTCPeerConnectionState) => void;

interface FileHeader {
  type: "header";
  size: number;
  name: string;
}

// ─── Peer Connection factory ──────────────────────────────────────────────────

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

// ─── Sender side ─────────────────────────────────────────────────────────────

/**
 * Set up the sender side of a WebRTC transfer.
 *
 * 1. Creates an RTCPeerConnection and a reliable data channel.
 * 2. Generates an SDP offer and sends it via the signal callback.
 * 3. Listens for ICE candidates and relays them.
 * 4. When the data channel opens, immediately begins sending the encrypted blob.
 *
 * @param encryptedBlob  Full wire-format encrypted file (IV prepended)
 * @param filename       Original filename (for the header frame)
 * @param onSignal       Function to relay signal payloads through RoomDO WS
 * @param onProgress     Optional byte-level progress callback
 * @param onStateChange  Optional connection state change callback
 * @returns              Object with methods to handle incoming signals and cleanup
 */
export function setupSender(
  encryptedBlob: ArrayBuffer,
  filename: string,
  onSignal: SignalSender,
  onProgress?: ProgressCallback,
  onStateChange?: ConnectionStateCallback,
): {
  handleSignal: (payload: RTCSignalPayload) => Promise<void>;
  close: () => void;
} {
  const pc = createPeerConnection();

  // Track ICE candidates that arrive before remote description is set
  const pendingCandidates: RTCIceCandidateInit[] = [];
  let remoteDescSet = false;

  // Create data channel (sender always creates it)
  const dc = pc.createDataChannel("file", {
    ordered: true,
    // No maxRetransmits — we want reliable delivery
  });
  dc.binaryType = "arraybuffer";

  // ICE candidate relay
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onSignal({ kind: "ice", candidate: event.candidate.toJSON() });
    }
  };

  if (onStateChange) {
    pc.onconnectionstatechange = () => onStateChange(pc.connectionState);
  }

  // Start sending when channel opens
  dc.onopen = () => {
    sendFile(dc, encryptedBlob, filename, onProgress).catch((err) => {
      console.error("WebRTC send error:", err);
    });
  };

  // Create and send offer
  (async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    onSignal({ kind: "offer", sdp: pc.localDescription! });
  })().catch((err) => console.error("Offer creation failed:", err));

  const handleSignal = async (payload: RTCSignalPayload) => {
    if (payload.kind === "answer") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      remoteDescSet = true;
      // Flush pending ICE candidates
      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidates.length = 0;
    } else if (payload.kind === "ice") {
      if (remoteDescSet) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        pendingCandidates.push(payload.candidate);
      }
    }
  };

  return {
    handleSignal,
    close: () => {
      dc.close();
      pc.close();
    },
  };
}

// ─── Receiver side ────────────────────────────────────────────────────────────

/**
 * Set up the receiver side of a WebRTC transfer.
 *
 * 1. Creates an RTCPeerConnection.
 * 2. Waits for an offer from the sender (via handleSignal).
 * 3. Creates an answer and sends it back.
 * 4. Reassembles received chunks into a single ArrayBuffer.
 *
 * @param onSignal      Function to relay signal payloads through RoomDO WS
 * @param onProgress    Optional byte-level progress callback
 * @param onStateChange Optional connection state callback
 * @param timeoutMs     Max ms to wait for connection (default 15s)
 * @returns             Object with handleSignal method and a promise that
 *                      resolves with { blob, filename } when transfer completes
 */
export function setupReceiver(
  onSignal: SignalSender,
  onProgress?: ProgressCallback,
  onStateChange?: ConnectionStateCallback,
  timeoutMs = CONNECTION_TIMEOUT,
): {
  handleSignal: (payload: RTCSignalPayload) => Promise<void>;
  result: Promise<{ blob: ArrayBuffer; filename: string }>;
  close: () => void;
} {
  const pc = createPeerConnection();
  const pendingCandidates: RTCIceCandidateInit[] = [];
  let remoteDescSet = false;

  let resolveResult!: (value: { blob: ArrayBuffer; filename: string }) => void;
  let rejectResult!: (reason: Error) => void;

  const result = new Promise<{ blob: ArrayBuffer; filename: string }>((res, rej) => {
    resolveResult = res;
    rejectResult = rej;
  });

  // Connection timeout
  const timeoutId = setTimeout(() => {
    rejectResult(new Error("WebRTC connection timed out"));
    pc.close();
  }, timeoutMs);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      onSignal({ kind: "ice", candidate: event.candidate.toJSON() });
    }
  };

  if (onStateChange) {
    pc.onconnectionstatechange = () => {
      onStateChange(pc.connectionState);
      if (pc.connectionState === "connected") {
        clearTimeout(timeoutId);
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        rejectResult(new Error(`WebRTC connection ${pc.connectionState}`));
      }
    };
  }

  // Receive data channel from sender
  pc.ondatachannel = (event) => {
    const dc = event.channel;
    dc.binaryType = "arraybuffer";
    receiveFile(dc, onProgress)
      .then(resolveResult)
      .catch(rejectResult)
      .finally(() => clearTimeout(timeoutId));
  };

  const handleSignal = async (payload: RTCSignalPayload) => {
    if (payload.kind === "offer") {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      remoteDescSet = true;

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onSignal({ kind: "answer", sdp: pc.localDescription! });

      // Flush queued ICE candidates
      for (const candidate of pendingCandidates) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      pendingCandidates.length = 0;
    } else if (payload.kind === "ice") {
      if (remoteDescSet) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        pendingCandidates.push(payload.candidate);
      }
    }
  };

  return {
    handleSignal,
    result,
    close: () => {
      clearTimeout(timeoutId);
      pc.close();
    },
  };
}

// ─── Data channel I/O ─────────────────────────────────────────────────────────

/**
 * Send a file over an open RTCDataChannel.
 * Protocol:
 *  1. Send JSON header: { type: "header", size, name }
 *  2. Send binary chunks of CHUNK_SIZE bytes
 *  3. Implements backpressure via bufferedAmountLowThreshold
 */
async function sendFile(
  dc: RTCDataChannel,
  blob: ArrayBuffer,
  filename: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const total = blob.byteLength;

  // Send header
  const header: FileHeader = { type: "header", size: total, name: filename };
  dc.send(JSON.stringify(header));

  dc.bufferedAmountLowThreshold = CHUNK_SIZE;

  let offset = 0;

  const sendNextChunk = (): Promise<void> => {
    return new Promise((resolve) => {
      const pump = () => {
        while (offset < total) {
          if (dc.bufferedAmount > BUFFER_HIGH_WATER) {
            // Backpressure — wait for buffer to drain
            dc.onbufferedamountlow = () => {
              dc.onbufferedamountlow = null;
              pump();
            };
            return;
          }
          const chunk = blob.slice(offset, offset + CHUNK_SIZE);
          dc.send(chunk);
          offset += chunk.byteLength;
          onProgress?.(offset, total);
        }
        resolve();
      };
      pump();
    });
  };

  await sendNextChunk();
}

/**
 * Receive a file from an RTCDataChannel.
 * Reassembles chunks into a single ArrayBuffer.
 */
function receiveFile(
  dc: RTCDataChannel,
  onProgress?: ProgressCallback,
): Promise<{ blob: ArrayBuffer; filename: string }> {
  return new Promise((resolve, reject) => {
    let expectedSize = 0;
    let filename = "download";
    const chunks: ArrayBuffer[] = [];
    let received = 0;
    let headerReceived = false;

    dc.onmessage = (event: MessageEvent) => {
      if (!headerReceived && typeof event.data === "string") {
        try {
          const header = JSON.parse(event.data) as FileHeader;
          if (header.type === "header") {
            expectedSize = header.size;
            filename = header.name;
            headerReceived = true;
          }
        } catch {
          reject(new Error("Invalid file header"));
        }
        return;
      }

      if (event.data instanceof ArrayBuffer) {
        chunks.push(event.data);
        received += event.data.byteLength;
        onProgress?.(received, expectedSize);

        if (expectedSize > 0 && received >= expectedSize) {
          // Reassemble
          const combined = new Uint8Array(received);
          let pos = 0;
          for (const chunk of chunks) {
            combined.set(new Uint8Array(chunk), pos);
            pos += chunk.byteLength;
          }
          resolve({ blob: combined.buffer, filename });
        }
      }
    };

    dc.onerror = (event) => {
      reject(new Error(`Data channel error: ${JSON.stringify(event)}`));
    };

    dc.onclose = () => {
      if (received < expectedSize) {
        reject(new Error(`Data channel closed before transfer complete (${received}/${expectedSize})`));
      }
    };
  });
}
