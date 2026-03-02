import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import type { Env } from "../RoomDO";
import { createDb, schema } from "../db";
import {
  getPresignedPutUrl,
  getPresignedGetUrl,
  deleteS3Object,
  s3ConfigFromEnv,
} from "../utils/s3";

export const roomRouter = new Hono<{ Bindings: Env }>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISOSafe(d: Date | number | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PERSONAL ROOMS
// Owner sets alias + password at creation. Anyone can view/download.
// Only owner (via password) can add or delete files.
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/rooms/personal — Create a personal room ────────────────────────

const createPersonalSchema = z.object({
  alias: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/, "Alias must be lowercase letters, numbers, or hyphens"),
  label: z.string().max(80).optional(),
  passwordHash: z.string().length(64), // SHA-256 hex — required
  expiresIn: z.union([
    z.literal(24),
    z.literal(168),  // 7 days
    z.literal(720),  // 30 days
  ]).default(24),
});

roomRouter.post("/personal", zValidator("json", createPersonalSchema), async (c) => {
  const { alias, label, passwordHash, expiresIn } = c.req.valid("json");
  const db = createDb(c.env.DB);
  const normalAlias = alias.toLowerCase();

  // Check alias availability
  const existing = await db
    .select({ alias: schema.aliases.alias })
    .from(schema.aliases)
    .where(eq(schema.aliases.alias, normalAlias))
    .get();

  if (existing) {
    return c.json({ error: "Username already taken", code: "ALIAS_TAKEN" }, 409);
  }

  const roomId = nanoid(21);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresIn * 60 * 60 * 1000);

  await db.insert(schema.rooms).values({
    id: roomId,
    roomType: "personal",
    label: label ?? null,
    alias: normalAlias,
    oneTimeDownload: false,
    passwordHash,
    createdAt: now,
    expiresAt,
  });

  await db.insert(schema.aliases).values({
    alias: normalAlias,
    roomId,
    createdAt: now,
    expiresAt,
  });

  return c.json({ roomId, alias: normalAlias, expiresAt: toISOSafe(expiresAt) }, 201);
});

// ── GET /api/rooms/personal/:alias — Resolve alias and get room + files ────────
//
// Public endpoint — returns room metadata and file list (without keyBase64 in
// the response, since keys are returned individually per-file for download).
// Actually keys ARE returned so the browser can decrypt; the room is "public"
// in the sense that anyone with the alias can view and download.

roomRouter.get("/personal/:alias", async (c) => {
  const alias = c.req.param("alias").toLowerCase();
  const db = createDb(c.env.DB);

  const aliasRow = await db
    .select({ roomId: schema.aliases.roomId, expiresAt: schema.aliases.expiresAt })
    .from(schema.aliases)
    .where(eq(schema.aliases.alias, alias))
    .get();

  if (!aliasRow) {
    return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
  }

  if (aliasRow.expiresAt !== null && aliasRow.expiresAt < new Date()) {
    return c.json({ error: "Room has expired", code: "EXPIRED" }, 410);
  }

  const room = await db
    .select()
    .from(schema.rooms)
    .where(eq(schema.rooms.id, aliasRow.roomId))
    .get();

  if (!room || room.roomType !== "personal") {
    return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
  }

  const fileRows = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.roomId, room.id));

  const s3cfg = s3ConfigFromEnv(c.env);
  const files = await Promise.all(
    fileRows.map(async (f) => ({
      fileId: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      iv: f.iv,
      keyBase64: f.keyBase64,
      getUrl: await getPresignedGetUrl(s3cfg, f.id, 3600),
      downloadCount: f.downloadCount,
      createdAt: toISOSafe(f.createdAt),
    })),
  );

  return c.json({
    roomId: room.id,
    alias: room.alias,
    label: room.label,
    expiresAt: toISOSafe(room.expiresAt),
    files,
  });
});

// ── POST /api/rooms/:roomId/files/personal — Owner adds a file ────────────────
//
// Password required. Returns a presigned S3 PUT URL.

const addPersonalFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(104_857_600),
  mimeType: z.string().min(1).max(128),
  iv: z.string().min(1),
  keyBase64: z.string().min(1),
  passwordHash: z.string().length(64),
});

roomRouter.post(
  "/:roomId/files/personal",
  zValidator("json", addPersonalFileSchema),
  async (c) => {
    const roomId = c.req.param("roomId");
    const { name, size, mimeType, iv, keyBase64, passwordHash } = c.req.valid("json");
    const db = createDb(c.env.DB);

    const room = await db
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.id, roomId))
      .get();

    if (!room || room.roomType !== "personal") {
      return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
    }
    if (room.expiresAt < new Date()) {
      return c.json({ error: "Room has expired", code: "EXPIRED" }, 410);
    }
    if (room.passwordHash !== passwordHash) {
      return c.json({ error: "Incorrect password", code: "WRONG_PASSWORD" }, 403);
    }

    const fileId = nanoid(21);
    const encryptedSize = size + 28;
    const now = new Date();

    await db.insert(schema.files).values({
      id: fileId,
      roomId,
      name,
      size,
      encryptedSize,
      mimeType,
      iv,
      keyBase64,
      downloadCount: 0,
      createdAt: now,
      expiresAt: room.expiresAt,
    });

    const putUrl = await getPresignedPutUrl(
      s3ConfigFromEnv(c.env),
      fileId,
      encryptedSize,
      "application/octet-stream",
      3600,
    );

    return c.json({ fileId, putUrl, expiresAt: toISOSafe(room.expiresAt) }, 201);
  },
);

// ── DELETE /api/rooms/:roomId/files/:fileId — Owner deletes a file ─────────────

const deletePersonalFileSchema = z.object({
  passwordHash: z.string().length(64),
});

roomRouter.delete(
  "/:roomId/files/:fileId",
  zValidator("json", deletePersonalFileSchema),
  async (c) => {
    const roomId = c.req.param("roomId");
    const fileId = c.req.param("fileId");
    const { passwordHash } = c.req.valid("json");
    const db = createDb(c.env.DB);

    const room = await db
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.id, roomId))
      .get();

    if (!room) {
      return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
    }
    if (!room.passwordHash || room.passwordHash !== passwordHash) {
      return c.json({ error: "Incorrect password", code: "WRONG_PASSWORD" }, 403);
    }

    const file = await db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.id, fileId), eq(schema.files.roomId, roomId)))
      .get();

    if (!file) {
      return c.json({ error: "File not found", code: "NOT_FOUND" }, 404);
    }

    await deleteS3Object(s3ConfigFromEnv(c.env), fileId);
    await db.delete(schema.files).where(eq(schema.files.id, fileId));

    return c.json({ ok: true });
  },
);

// ── POST /api/rooms/:roomId/password — Verify owner password ──────────────────

const verifyPasswordSchema = z.object({
  passwordHash: z.string().length(64),
});

roomRouter.post(
  "/:roomId/password",
  zValidator("json", verifyPasswordSchema),
  async (c) => {
    const roomId = c.req.param("roomId");
    const { passwordHash } = c.req.valid("json");
    const db = createDb(c.env.DB);

    const room = await db
      .select({ passwordHash: schema.rooms.passwordHash })
      .from(schema.rooms)
      .where(eq(schema.rooms.id, roomId))
      .get();

    if (!room) {
      return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
    }
    if (room.passwordHash !== passwordHash) {
      return c.json({ error: "Incorrect password", code: "WRONG_PASSWORD" }, 403);
    }

    return c.json({ ok: true });
  },
);

// ═══════════════════════════════════════════════════════════════════════════════
// SEND ROOMS
// Ephemeral. The AES key lives ONLY in the URL fragment — server never sees it.
// Transfer: WebRTC P2P first, S3 fallback.
// ═══════════════════════════════════════════════════════════════════════════════

// ── POST /api/rooms/send — Create an ephemeral send room ──────────────────────

const createSendSchema = z.object({
  expiresIn: z.number().int().min(1).max(168).default(24),
});

roomRouter.post("/send", zValidator("json", createSendSchema), async (c) => {
  const { expiresIn } = c.req.valid("json");
  const db = createDb(c.env.DB);

  const roomId = nanoid(21);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresIn * 60 * 60 * 1000);

  await db.insert(schema.rooms).values({
    id: roomId,
    roomType: "send",
    label: null,
    alias: null,
    oneTimeDownload: false,
    passwordHash: null,
    createdAt: now,
    expiresAt,
  });

  // Init RoomDO for WebRTC signaling
  const roomStub = c.env.ROOM_DO.getByName(roomId);
  await roomStub.initRoom(roomId);

  return c.json({ roomId, expiresAt: toISOSafe(expiresAt) }, 201);
});

// ── POST /api/rooms/:roomId/files/send — Register a file in a send room ───────
//
// keyBase64 is now stored server-side so any recipient can decrypt without
// needing the key in the URL fragment.

const addSendFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(104_857_600),
  mimeType: z.string().min(1).max(128),
  iv: z.string().min(1),
  keyBase64: z.string().min(1),
});

roomRouter.post(
  "/:roomId/files/send",
  zValidator("json", addSendFileSchema),
  async (c) => {
    const roomId = c.req.param("roomId");
    const { name, size, mimeType, iv, keyBase64 } = c.req.valid("json");
    const db = createDb(c.env.DB);

    const room = await db
      .select()
      .from(schema.rooms)
      .where(eq(schema.rooms.id, roomId))
      .get();

    if (!room || room.roomType !== "send") {
      return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
    }
    if (room.expiresAt < new Date()) {
      return c.json({ error: "Room has expired", code: "EXPIRED" }, 410);
    }

    const fileId = nanoid(21);
    const encryptedSize = size + 28;
    const now = new Date();

    await db.insert(schema.files).values({
      id: fileId,
      roomId,
      name,
      size,
      encryptedSize,
      mimeType,
      iv,
      keyBase64, // stored server-side for send rooms
      downloadCount: 0,
      createdAt: now,
      expiresAt: room.expiresAt,
    });

    const putUrl = await getPresignedPutUrl(
      s3ConfigFromEnv(c.env),
      fileId,
      encryptedSize,
      "application/octet-stream",
      3600,
    );

    return c.json({ fileId, putUrl, expiresAt: toISOSafe(room.expiresAt) }, 201);
  },
);

// ── GET /api/rooms/:roomId/send — Get send room metadata + file list ───────────
//
// Returns keyBase64 per file so the receiver can decrypt without a URL fragment.

roomRouter.get("/:roomId/send", async (c) => {
  const roomId = c.req.param("roomId");
  const db = createDb(c.env.DB);

  const room = await db
    .select()
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get();

  if (!room || room.roomType !== "send") {
    return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
  }
  if (room.expiresAt < new Date()) {
    return c.json({ error: "Room has expired", code: "EXPIRED" }, 410);
  }

  const fileRows = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.roomId, roomId));

  const s3cfg = s3ConfigFromEnv(c.env);
  const files = await Promise.all(
    fileRows.map(async (f) => ({
      fileId: f.id,
      name: f.name,
      size: f.size,
      mimeType: f.mimeType,
      iv: f.iv,
      keyBase64: f.keyBase64,
      getUrl: await getPresignedGetUrl(s3cfg, f.id, 3600),
    })),
  );

  return c.json({ roomId: room.id, expiresAt: toISOSafe(room.expiresAt), files });
});
