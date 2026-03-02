CREATE TABLE IF NOT EXISTS `files` (
  `id` text PRIMARY KEY NOT NULL,
  `room_id` text NOT NULL,
  `name` text NOT NULL,
  `size` integer NOT NULL,
  `encrypted_size` integer NOT NULL,
  `mime_type` text NOT NULL,
  `iv` text NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);

CREATE TABLE IF NOT EXISTS `aliases` (
  `alias` text PRIMARY KEY NOT NULL,
  `file_id` text NOT NULL,
  `key` text NOT NULL,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
