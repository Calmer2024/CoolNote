DROP INDEX IF EXISTS idx_notes_active_sort;
CREATE INDEX idx_notes_active_sort ON notes(deleted_at, is_archived, updated_at DESC, id ASC);

PRAGMA user_version = 10;
