import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Rooms Table ──────────────────────────────────────────────────────────────
// A room groups multiple files under one share link with shared policies.
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(), // nanoid — used as the room share ID
  label: text("label"), // optional display label
  alias: text("alias"), // back-reference to aliases.alias if a personal room
  oneTimeDownload: integer("one_time_download", { mode: "boolean" }).notNull().default(false),
  passwordHash: text("password_hash"), // SHA-256 hex, null = no password
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

// ─── Files Table ─────────────────────────────────────────────────────────────
// Each file belongs to a room. The encrypted bytes live in S3/R2.
export const files = sqliteTable("files", {
  id: text("id").primaryKey(), // nanoid — same as R2 object key
  roomId: text("room_id").notNull().references(() => rooms.id),
  name: text("name").notNull(),
  size: integer("size").notNull(), // original (pre-encryption) size in bytes
  encryptedSize: integer("encrypted_size").notNull(),
  mimeType: text("mime_type").notNull(),
  /** IV as base64url */
  iv: text("iv").notNull(),
  /** Per-file AES-GCM-256 key as base64url — stored so room link can carry all keys */
  keyBase64: text("key_base64").notNull(),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

// ─── Aliases Table ────────────────────────────────────────────────────────────
// Personal links: /u/:alias → room
// expires_at is nullable: NULL means the alias (and room) never auto-expires.
export const aliases = sqliteTable("aliases", {
  alias: text("alias").primaryKey(), // e.g. "dhruv"
  roomId: text("room_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }), // nullable
});

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type Alias = typeof aliases.$inferSelect;
export type NewAlias = typeof aliases.$inferInsert;

export const schema = { rooms, files, aliases };
