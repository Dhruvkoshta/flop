import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { RESERVED_ALIASES, type CheckAliasResponse } from "@flop/shared";
import type { Env } from "../RoomDO";
import { createDb, schema } from "../db";

export const aliasRouter = new Hono<{ Bindings: Env }>();

/**
 * GET /api/aliases/check/:alias
 *
 * Edge check for alias availability:
 * 1. Validates handle format and reserved keywords
 * 2. Checks Cloudflare KV_ALIASES for instant cache hit
 * 3. Falls back to D1 database and checks expiration
 */
aliasRouter.get("/check/:alias", async (c) => {
  const rawAlias = c.req.param("alias");
  const alias = rawAlias.toLowerCase();

  // Format check
  if (!/^[a-z0-9-]+$/.test(alias) || alias.length < 2 || alias.length > 32) {
    return c.json<CheckAliasResponse>({ alias, available: false, reason: "invalid" });
  }

  // Reserved keyword check
  if ((RESERVED_ALIASES as readonly string[]).includes(alias)) {
    return c.json<CheckAliasResponse>({ alias, available: false, reason: "reserved" });
  }

  // 1. Check Cloudflare KV
  try {
    const kvVal = await c.env.KV_ALIASES.get(alias);
    if (kvVal !== null) {
      return c.json<CheckAliasResponse>({ alias, available: false, reason: "taken" });
    }
  } catch (err) {
    console.error("KV alias check error:", err);
  }

  // 2. Check D1 database (in case KV didn't have it or was cold)
  const db = createDb(c.env.DB);
  const existing = await db
    .select({ alias: schema.aliases.alias, expiresAt: schema.aliases.expiresAt })
    .from(schema.aliases)
    .where(eq(schema.aliases.alias, alias))
    .get();

  if (existing) {
    // If expired, it's available!
    if (existing.expiresAt !== null && existing.expiresAt < new Date()) {
      return c.json<CheckAliasResponse>({ alias, available: true });
    }

    // Still active in D1: re-populate KV with remaining TTL
    try {
      if (existing.expiresAt) {
        const ttlSeconds = Math.max(
          60,
          Math.floor((new Date(existing.expiresAt).getTime() - Date.now()) / 1000),
        );
        await c.env.KV_ALIASES.put(alias, "taken", { expirationTtl: ttlSeconds });
      } else {
        await c.env.KV_ALIASES.put(alias, "taken");
      }
    } catch (err) {
      console.error("Failed to backfill KV alias:", err);
    }

    return c.json<CheckAliasResponse>({ alias, available: false, reason: "taken" });
  }

  return c.json<CheckAliasResponse>({ alias, available: true });
});

/**
 * GET /api/aliases/:alias — Resolve alias -> roomId
 */
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
