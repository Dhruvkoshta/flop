-- Migration 0003: Personal rooms support
-- * aliases.expires_at is now nullable (personal rooms can be long-lived)
-- * rooms gets an optional alias column for quick reverse-lookup

-- SQLite doesn't support DROP NOT NULL directly; recreate aliases table
CREATE TABLE IF NOT EXISTS `aliases_new` (
  `alias`      text PRIMARY KEY NOT NULL,
  `room_id`    text NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer          -- nullable: NULL = no expiry
);

INSERT INTO `aliases_new` SELECT `alias`, `room_id`, `created_at`, `expires_at` FROM `aliases`;
DROP TABLE `aliases`;
ALTER TABLE `aliases_new` RENAME TO `aliases`;

-- Add alias back-reference to rooms for easy lookup
ALTER TABLE `rooms` ADD COLUMN `alias` text;

-- Add created_at to files for display on personal room pages
-- (column may already exist in some deployments — guard with IF NOT EXISTS not supported
--  in older SQLite; use a safe default approach)
ALTER TABLE `files` ADD COLUMN `file_created_at` integer;
