import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../RoomDO";
import { createDb } from "../db";
import { schema } from "../db";

export const aliasRouter = new Hono<{ Bindings: Env }>();

// ── GET /api/aliases/:alias — Resolve alias → roomId ─────────────────────────
//
// Used by the frontend PersonalRoomPage to resolve /u/:alias → roomId, then
// load room metadata via GET /api/rooms/:roomId.

aliasRouter.get("/:alias", async (c) => {
  const alias = c.req.param("alias").toLowerCase();
  const db = createDb(c.env.DB);

  const row = await db
    .select()
    .from(schema.aliases)
    .where(eq(schema.aliases.alias, alias))
    .get();

  if (!row) {
    return c.json({ error: "Username not found", code: "NOT_FOUND" }, 404);
  }

  // Check expiry (expiresAt is nullable — null means no expiry)
  if (row.expiresAt !== null && row.expiresAt < new Date()) {
    return c.json({ error: "This room has expired", code: "EXPIRED" }, 410);
  }

  return c.json({
    alias: row.alias,
    roomId: row.roomId,
    expiresAt: row.expiresAt
      ? (row.expiresAt instanceof Date
          ? row.expiresAt.toISOString()
          : new Date(row.expiresAt).toISOString())
      : null,
  });
});
