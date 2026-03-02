import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Rooms Table ──────────────────────────────────────────────────────────────
export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  /** "personal" = owner-managed, public download; "send" = ephemeral P2P/S3 transfer */
  roomType: text("room_type", { enum: ["personal", "send"] }).notNull().default("send"),
  label: text("label"),
  alias: text("alias"),                   // only set for personal rooms
  oneTimeDownload: integer("one_time_download", { mode: "boolean" }).notNull().default(false),
  passwordHash: text("password_hash"),    // required for personal rooms
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

// ─── Files Table ──────────────────────────────────────────────────────────────
export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  roomId: text("room_id").notNull().references(() => rooms.id),
  name: text("name").notNull(),
  size: integer("size").notNull(),
  encryptedSize: integer("encrypted_size").notNull(),
  mimeType: text("mime_type").notNull(),
  iv: text("iv").notNull(),
  /**
   * For personal rooms: the AES-GCM-256 key (base64url) stored server-side.
   * For send rooms: empty string — key lives only in the URL fragment.
   */
  keyBase64: text("key_base64").notNull().default(""),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

// ─── Aliases Table ────────────────────────────────────────────────────────────
export const aliases = sqliteTable("aliases", {
  alias: text("alias").primaryKey(),
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
