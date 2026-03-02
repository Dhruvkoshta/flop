-- Migration 0004: Add room_type column to distinguish personal rooms from send rooms
-- personal = owner-managed public file store at /u/:alias
-- send     = ephemeral P2P/S3 transfer (default, existing behaviour)

ALTER TABLE `rooms` ADD COLUMN `room_type` text NOT NULL DEFAULT 'send';
