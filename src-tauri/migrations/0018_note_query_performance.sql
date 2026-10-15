BEGIN;
CREATE INDEX IF NOT EXISTS idx_notes_category_pinned_sort
ON notes(category_id, deleted_at, is_archived, is_pinned DESC, updated_at DESC, id ASC);
PRAGMA user_version=18;
COMMIT;
