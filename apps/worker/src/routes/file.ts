import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../RoomDO";
import { createDb, schema } from "../db";

export const fileRouter = new Hono<{ Bindings: Env }>();

/**
 * PUT /api/file/:id/raw
 * Direct binary upload into R2 bucket from browser
 */
fileRouter.put("/:id/raw", async (c) => {
  const fileId = c.req.param("id");
  const body = c.req.raw.body;

  if (!body) {
    return c.json({ error: "Missing body", code: "BAD_REQUEST" }, 400);
  }

  const db = createDb(c.env.DB);
  const file = await db
    .select({ id: schema.files.id, expiresAt: schema.files.expiresAt, mimeType: schema.files.mimeType })
    .from(schema.files)
    .where(eq(schema.files.id, fileId))
    .get();

  if (!file) {
    return c.json({ error: "File not registered", code: "NOT_FOUND" }, 404);
  }

  if (file.expiresAt < new Date()) {
    return c.json({ error: "File has expired", code: "EXPIRED" }, 410);
  }

  await c.env.BUCKET.put(fileId, body, {
    httpMetadata: {
      contentType: file.mimeType || "application/octet-stream",
    },
  });

  return c.json({ ok: true });
});

/**
 * GET /api/file/:id/raw
 * Direct binary download from R2 bucket
 */
fileRouter.get("/:id/raw", async (c) => {
  const fileId = c.req.param("id");

  const db = createDb(c.env.DB);
  const file = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.id, fileId))
    .get();

  if (!file) {
    return c.json({ error: "File not found", code: "NOT_FOUND" }, 404);
  }

  if (file.expiresAt < new Date()) {
    return c.json({ error: "File has expired", code: "EXPIRED" }, 410);
  }

  const object = await c.env.BUCKET.get(fileId);
  if (!object) {
    return c.json({ error: "Object not found in storage", code: "NOT_FOUND" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Content-Type", "application/octet-stream");
  if (object.size) {
    headers.set("Content-Length", object.size.toString());
  }

  return new Response(object.body, { headers });
});

/**
 * GET /api/file/:id
 *
 * Returns file metadata and download URL.
 */
fileRouter.get("/:id", async (c) => {
  const fileId = c.req.param("id");

  const db = createDb(c.env.DB);
  const file = await db
    .select()
    .from(schema.files)
    .where(eq(schema.files.id, fileId))
    .get();

  if (!file) {
    return c.json({ error: "File not found", code: "NOT_FOUND" }, 404);
  }

  // Check expiry
  if (file.expiresAt < new Date()) {
    return c.json({ error: "File has expired", code: "EXPIRED" }, 410);
  }

  return c.json({
    fileId: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    iv: file.iv,
    getUrl: `/api/file/${file.id}/raw`,
    expiresAt: file.expiresAt instanceof Date ? file.expiresAt.toISOString() : new Date(file.expiresAt).toISOString(),
  });
});
