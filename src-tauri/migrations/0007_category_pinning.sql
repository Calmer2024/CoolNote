ALTER TABLE categories ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;

PRAGMA user_version = 7;
