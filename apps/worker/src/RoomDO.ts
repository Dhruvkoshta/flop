import { DurableObject } from "cloudflare:workers";
import type { ClientMessage, ServerMessage, PeerRole } from "@flop/shared";
import { deleteS3Object, s3ConfigFromEnv } from "./utils/s3";
import { createDb, schema } from "./db";
import { eq } from "drizzle-orm";

// ─── Env type (matches wrangler.jsonc bindings) ─────────────────────────────

export interface Env {
  ROOM_DO: DurableObjectNamespace<RoomDO>;
  DB: D1Database;
  KV_ALIASES: KVNamespace;
  ASSETS: Fetcher;
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  S3_BUCKET_NAME: string;
  FRONTEND_ORIGIN: string | string[];
  MAX_FILE_SIZE: string;
}

// ─── Room SQLite row types ────────────────────────────────────────────────────

interface RoomRow extends Record<string, SqlStorageValue> {
  room_id: string;
  status: "waiting" | "connected" | "transferring" | "done";
  sender_online: 0 | 1;
  created_at: number;
  expires_at: number;
}

// ─── Per-connection metadata (not persisted — lives in memory) ───────────────

interface PeerMeta {
  role: PeerRole;
  ws: WebSocket;
}

// ─── RoomDO ──────────────────────────────────────────────────────────────────

/**
 * One Durable Object instance per room.
 * Named by roomId.
 *
 * Responsibilities:
 *  1. Accept WebSocket connections from sender and receivers.
 *  2. Relay WebRTC SDP offers/answers and ICE candidates (signaling).
 *  3. Track whether the sender is currently online.
 *  4. Schedule a 24h alarm to delete all S3 objects in the room and clean up.
 *
 * Uses WebSocket Hibernation API so the DO doesn't burn CPU while idle.
 */
export class RoomDO extends DurableObject<Env> {
  // In-memory map of open connections; reset on hibernation wake-up
  private peers = new Map<WebSocket, PeerMeta>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    // Initialize SQLite schema on first instantiation
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS room (
          room_id     TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'waiting',
          sender_online INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL,
          expires_at  INTEGER NOT NULL
        )
      `);
    });
  }

  // ── Public RPC: called from Worker fetch handler to init the room ──────────

  async initRoom(roomId: string): Promise<void> {
    const existing = this.ctx.storage.sql
      .exec<RoomRow>("SELECT room_id FROM room LIMIT 1")
      .toArray();

    if (existing.length > 0) return; // already initialized

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours

    this.ctx.storage.sql.exec(
      "INSERT INTO room (room_id, status, sender_online, created_at, expires_at) VALUES (?, 'waiting', 0, ?, ?)",
      roomId,
      now,
      expiresAt,
    );

    // Schedule alarm for cleanup after 24h
    await this.ctx.storage.setAlarm(expiresAt);
  }

  // ── WebSocket upgrade entry point ─────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get("role") as PeerRole | null;

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    if (!role || (role !== "sender" && role !== "receiver")) {
      return new Response("role query param must be 'sender' or 'receiver'", { status: 400 });
    }

    // Use WebSocket Hibernation API
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [role]); // tag = role for identification after hibernation

    // Track in memory
    this.peers.set(server, { role, ws: server });

    // Update sender_online if sender just joined
    if (role === "sender") {
      this.ctx.storage.sql.exec("UPDATE room SET sender_online = 1");
    }

    // Notify the joining peer about current room state
    const row = this.getRoomRow();
    const senderOnline = row ? row.sender_online === 1 : false;
    const joined: ServerMessage = {
      type: "joined",
      role,
      peersOnline: this.peers.size,
      senderOnline,
    };
    server.send(JSON.stringify(joined));

    // Notify other peers that someone joined
    this.broadcast(
      server,
      JSON.stringify({ type: "peer_joined", role, senderOnline } satisfies ServerMessage),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation API handlers ───────────────────────────────────────────────

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" } satisfies ServerMessage));
      return;
    }

    // Re-populate in-memory peers map after hibernation wake-up if needed
    if (!this.peers.has(ws)) {
      const tags = this.ctx.getTags(ws);
      const role = (tags[0] ?? "receiver") as PeerRole;
      this.peers.set(ws, { role, ws });
    }

    switch (msg.type) {
      case "signal": {
        // Relay the WebRTC signal to the other peer(s)
        const payload: ServerMessage = { type: "signal", payload: msg.payload };
        this.broadcast(ws, JSON.stringify(payload));
        break;
      }
      case "ping": {
        ws.send(JSON.stringify({ type: "pong" } satisfies ServerMessage));
        break;
      }
      case "join": {
        // Re-join after reconnect — update state and re-announce
        const { role } = msg;
        this.peers.set(ws, { role, ws });
        if (role === "sender") {
          this.ctx.storage.sql.exec("UPDATE room SET sender_online = 1");
        }
        const row = this.getRoomRow();
        const senderOnline = row ? row.sender_online === 1 : false;
        const joined: ServerMessage = {
          type: "joined",
          role,
          peersOnline: this.peers.size,
          senderOnline,
        };
        ws.send(JSON.stringify(joined));
        this.broadcast(ws, JSON.stringify({ type: "peer_joined", role, senderOnline } satisfies ServerMessage));
        break;
      }
      case "leave": {
        this.handleDisconnect(ws);
        ws.close(1000, "leave");
        break;
      }
    }
  }

  webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.handleDisconnect(ws);
  }

  webSocketError(ws: WebSocket, _error: unknown): void {
    this.handleDisconnect(ws);
  }

  // ── Alarm: fires after 24h — cleans up all S3 objects in the room ─────────

  async alarm(): Promise<void> {
    const row = this.getRoomRow();
    if (!row) return;

    const roomId = row.room_id;

    // Delete all files in this room from S3 via D1 lookup
    try {
      const db = createDb(this.env.DB);
      const files = await db
        .select({ id: schema.files.id })
        .from(schema.files)
        .where(eq(schema.files.roomId, roomId));

      await Promise.allSettled(
        files.map((f) => deleteS3Object(s3ConfigFromEnv(this.env), f.id)),
      );

      // Clean up D1 records
      await db.delete(schema.files).where(eq(schema.files.roomId, roomId));
      await db.delete(schema.rooms).where(eq(schema.rooms.id, roomId));
    } catch (err) {
      console.error(`RoomDO alarm: failed to clean up room ${roomId}`, err);
    }

    // Notify any remaining connected peers
    const offline: ServerMessage = { type: "sender_offline" };
    for (const [ws] of this.peers) {
      try {
        ws.send(JSON.stringify(offline));
        ws.close(1001, "expired");
      } catch {
        // ignore
      }
    }

    this.peers.clear();

    // Wipe SQLite state
    this.ctx.storage.sql.exec("DELETE FROM room");
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getRoomRow(): RoomRow | undefined {
    return this.ctx.storage.sql
      .exec<RoomRow>("SELECT * FROM room LIMIT 1")
      .toArray()[0];
  }

  /** Send a message to all connected peers except the sender.
   *
   * Uses this.ctx.getWebSockets() (Hibernation API) instead of the in-memory
   * this.peers map so that signals are delivered even after the DO hibernates
   * between messages (this.peers is cleared on hibernation wake-up).
   */
  private broadcast(exclude: WebSocket, message: string): void {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch {
          // stale — ignore
        }
      }
    }
  }

  private handleDisconnect(ws: WebSocket): void {
    // Prefer in-memory meta; fall back to hibernation tags when peers map is empty
    const meta = this.peers.get(ws);
    const role: PeerRole = meta?.role ?? ((this.ctx.getTags(ws)[0] ?? "receiver") as PeerRole);
    this.peers.delete(ws);

    if (role === "sender") {
      // Mark sender offline in SQLite so late-joining receivers fall back to S3
      this.ctx.storage.sql.exec("UPDATE room SET sender_online = 0");
      // Notify all receivers
      const msg: ServerMessage = { type: "sender_offline" };
      this.broadcast(ws, JSON.stringify(msg));
    }
  }
}
