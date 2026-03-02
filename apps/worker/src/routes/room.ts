import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
import type { Env } from "../RoomDO";
import { createDb } from "../db";
import { schema } from "../db";
import { getPresignedPutUrl, getPresignedGetUrl, deleteS3Object, s3ConfigFromEnv } from "../utils/s3";

export const roomRouter = new Hono<{ Bindings: Env }>();

// ── POST /api/rooms — Create a new room ───────────────────────────────────────

const createRoomSchema = z.object({
  label: z.string().max(80).optional(),
  expiresIn: z.number().int().min(1).max(8760).optional().default(24), // hours, max 1 year
  oneTimeDownload: z.boolean().optional().default(false),
  passwordHash: z.string().length(64).optional(), // SHA-256 hex
  // Optional alias for personal rooms — lowercase alphanumeric + hyphens, 2–32 chars
  alias: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/, "Alias must be lowercase letters, numbers, or hyphens")
    .optional(),
});

roomRouter.post("/", zValidator("json", createRoomSchema), async (c) => {
  const { label, expiresIn, oneTimeDownload, passwordHash, alias } = c.req.valid("json");

  const db = createDb(c.env.DB);

  // Check alias availability before creating the room
  if (alias) {
    const normalised = alias.toLowerCase();
    const existing = await db
      .select({ alias: schema.aliases.alias })
      .from(schema.aliases)
      .where(eq(schema.aliases.alias, normalised))
      .get();

    if (existing) {
      return c.json({ error: "Username already taken", code: "ALIAS_TAKEN" }, 409);
    }
  }

  const roomId = nanoid(21);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (expiresIn ?? 24) * 60 * 60 * 1000);
  const normalAlias = alias?.toLowerCase() ?? null;

  await db.insert(schema.rooms).values({
    id: roomId,
    label: label ?? null,
    alias: normalAlias,
    oneTimeDownload: oneTimeDownload ?? false,
    passwordHash: passwordHash ?? null,
    createdAt: now,
    expiresAt,
  });

  // Register alias if provided
  if (normalAlias) {
    await db.insert(schema.aliases).values({
      alias: normalAlias,
      roomId,
      createdAt: now,
      expiresAt, // mirrors the room expiry
    });
  }

  // Init the RoomDO to create SQLite schema + schedule alarm
  const roomStub = c.env.ROOM_DO.getByName(roomId);
  await roomStub.initRoom(roomId);

  return c.json({
    roomId,
    expiresAt: expiresAt.toISOString(),
    ...(normalAlias ? { alias: normalAlias } : {}),
  });
});

// ── POST /api/rooms/:roomId/files — Add a file to a room ─────────────────────

const addFileSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(104_857_600), // 100 MB
  mimeType: z.string().min(1).max(128),
  iv: z.string().min(1),
  keyBase64: z.string().min(1),
});

roomRouter.post("/:roomId/files", zValidator("json", addFileSchema), async (c) => {
  const roomId = c.req.param("roomId");
  const { name, size, mimeType, iv, keyBase64 } = c.req.valid("json");

  const db = createDb(c.env.DB);

  // Verify room exists and hasn't expired
  const room = await db
    .select()
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get();

  if (!room) {
    return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
  }
  if (room.expiresAt < new Date()) {
    return c.json({ error: "Room has expired", code: "EXPIRED" }, 410);
  }

  const fileId = nanoid(21);
  const encryptedSize = size + 28; // +12 IV + 16 GCM tag
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

  return c.json({
    fileId,
    putUrl,
    expiresAt: room.expiresAt instanceof Date
      ? room.expiresAt.toISOString()
      : new Date(room.expiresAt).toISOString(),
  });
});

// ── GET /api/rooms/:roomId — Get room metadata + file list ───────────────────

roomRouter.get("/:roomId", async (c) => {
  const roomId = c.req.param("roomId");
  const db = createDb(c.env.DB);

  const room = await db
    .select()
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get();

  if (!room) {
    return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
  }
  if (room.expiresAt < new Date()) {
    return c.json({ error: "Room has expired", code: "EXPIRED" }, 410);
  }

  const fileRows = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.roomId, roomId));

  // Generate presigned GET URLs for all files
  const s3cfg = s3ConfigFromEnv(c.env);
  const files = await Promise.all(
    fileRows.map(async (f) => {
      const getUrl = await getPresignedGetUrl(s3cfg, f.id, 3600);
      return {
        fileId: f.id,
        name: f.name,
        size: f.size,
        mimeType: f.mimeType,
        iv: f.iv,
        keyBase64: f.keyBase64,
        getUrl,
        downloadCount: f.downloadCount,
        createdAt: f.createdAt instanceof Date
          ? f.createdAt.toISOString()
          : new Date(f.createdAt).toISOString(),
      };
    }),
  );

  return c.json({
    roomId: room.id,
    label: room.label,
    alias: room.alias ?? null,
    oneTimeDownload: room.oneTimeDownload,
    hasPassword: !!room.passwordHash,
    expiresAt: room.expiresAt instanceof Date
      ? room.expiresAt.toISOString()
      : new Date(room.expiresAt).toISOString(),
    files,
  });
});

// ── POST /api/rooms/:roomId/verify — Verify room password ────────────────────

const verifySchema = z.object({
  passwordHash: z.string().length(64),
});

roomRouter.post("/:roomId/verify", zValidator("json", verifySchema), async (c) => {
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
});

// ── POST /api/rooms/:roomId/files/:fileId/download — Increment download count ─

roomRouter.post("/:roomId/files/:fileId/download", async (c) => {
  const roomId = c.req.param("roomId");
  const fileId = c.req.param("fileId");
  const db = createDb(c.env.DB);

  const file = await db
    .select()
    .from(schema.files)
    .where(and(eq(schema.files.id, fileId), eq(schema.files.roomId, roomId)))
    .get();

  if (!file) {
    return c.json({ error: "File not found", code: "NOT_FOUND" }, 404);
  }

  const room = await db
    .select()
    .from(schema.rooms)
    .where(eq(schema.rooms.id, roomId))
    .get();

  if (!room) {
    return c.json({ error: "Room not found", code: "NOT_FOUND" }, 404);
  }

  // Enforce one-time download policy
  if (room.oneTimeDownload && file.downloadCount >= 1) {
    return c.json({ error: "File has already been downloaded", code: "ALREADY_DOWNLOADED" }, 403);
  }

  await db
    .update(schema.files)
    .set({ downloadCount: file.downloadCount + 1 })
    .where(eq(schema.files.id, fileId));

  return c.json({ ok: true });
});

// ── DELETE /api/rooms/:roomId/files/:fileId — Delete a file (owner only) ──────
//
// Owner proves identity by supplying the room password hash.
// For passwordless personal rooms this endpoint is not used from the UI.

const deleteFileSchema = z.object({
  passwordHash: z.string().length(64),
});

roomRouter.delete(
  "/:roomId/files/:fileId",
  zValidator("json", deleteFileSchema),
  async (c) => {
    const roomId = c.req.param("roomId");
    const fileId = c.req.param("fileId");
    const { passwordHash } = c.req.valid("json");
    const db = createDb(c.env.DB);

    // Verify room + password
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

    // Verify file belongs to this room
    const file = await db
      .select()
      .from(schema.files)
      .where(and(eq(schema.files.id, fileId), eq(schema.files.roomId, roomId)))
      .get();

    if (!file) {
      return c.json({ error: "File not found", code: "NOT_FOUND" }, 404);
    }

    // Delete from S3
    await deleteS3Object(s3ConfigFromEnv(c.env), fileId);

    // Delete from D1
    await db.delete(schema.files).where(eq(schema.files.id, fileId));

    return c.json({ ok: true });
  },
);
