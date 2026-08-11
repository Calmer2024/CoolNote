ALTER TABLE libraries
ADD COLUMN settings_revision INTEGER NOT NULL DEFAULT 1;

PRAGMA user_version = 2;
