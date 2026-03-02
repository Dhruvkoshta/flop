import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../RoomDO";
import { createDb, schema } from "../db";
import { getPresignedGetUrl, s3ConfigFromEnv } from "../utils/s3";

export const fileRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/file/:id
 *
 * Returns file metadata and a presigned S3 GET URL.
 * Used by the receiver when falling back from P2P to S3 download.
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

  const getUrl = await getPresignedGetUrl(s3ConfigFromEnv(c.env), fileId, 3600);

  return c.json({
    fileId: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    iv: file.iv,
    getUrl,
    expiresAt: file.expiresAt instanceof Date ? file.expiresAt.toISOString() : new Date(file.expiresAt).toISOString(),
  });
});
