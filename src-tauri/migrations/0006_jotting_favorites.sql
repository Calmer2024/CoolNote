ALTER TABLE jottings ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;
PRAGMA user_version = 6;
