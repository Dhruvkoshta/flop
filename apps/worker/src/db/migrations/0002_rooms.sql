-- Migration 0002: Add rooms table and update files/aliases for multi-file room model

CREATE TABLE IF NOT EXISTS `rooms` (
  `id` text PRIMARY KEY NOT NULL,
  `label` text,
  `one_time_download` integer NOT NULL DEFAULT 0,
  `password_hash` text,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);

-- Add new columns to files (key per file, download count, FK to rooms)
ALTER TABLE `files` ADD COLUMN `key_base64` text NOT NULL DEFAULT '';
ALTER TABLE `files` ADD COLUMN `download_count` integer NOT NULL DEFAULT 0;

-- Update aliases to reference rooms instead of files
ALTER TABLE `aliases` ADD COLUMN `room_id` text NOT NULL DEFAULT '';
