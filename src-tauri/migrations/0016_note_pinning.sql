BEGIN;
ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS idx_notes_active_sort;
CREATE INDEX idx_notes_active_sort ON notes(deleted_at, is_archived, is_pinned DESC, updated_at DESC, id ASC);
PRAGMA user_version = 16;
COMMIT;
