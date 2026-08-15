ALTER TABLE notes ADD COLUMN mood TEXT;

DROP TABLE IF EXISTS note_tags;
DROP TABLE IF EXISTS tags;

ALTER TABLE attachments RENAME TO attachments_legacy;
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
INSERT INTO attachments(id,note_id,file_name,media_type,size_bytes,content_hash,relative_path,created_at)
SELECT id,note_id,file_name,media_type,size_bytes,relative_path,relative_path,created_at
FROM attachments_legacy;
DROP TABLE attachments_legacy;
CREATE INDEX idx_attachments_note ON attachments(note_id, created_at);
CREATE INDEX idx_attachments_hash ON attachments(content_hash);

PRAGMA user_version = 9;
