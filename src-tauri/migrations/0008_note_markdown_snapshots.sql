ALTER TABLE notes ADD COLUMN markdown_snapshot TEXT NOT NULL DEFAULT '';

UPDATE notes
SET markdown_snapshot = '# ' || title || char(10) || char(10) || plain_text || char(10)
WHERE markdown_snapshot = '';

CREATE TABLE note_versions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  markdown_snapshot TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(note_id, revision)
);

CREATE INDEX idx_note_versions_note_revision ON note_versions(note_id, revision DESC);

PRAGMA user_version = 8;
