CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_categories_parent_sort ON categories(parent_id, deleted_at, sort_order, name);
CREATE INDEX idx_notes_active_sort ON notes(deleted_at, is_archived, is_pinned DESC, updated_at DESC, id ASC);
CREATE INDEX idx_notes_category ON notes(category_id, deleted_at, updated_at DESC);
CREATE INDEX idx_notes_favorite ON notes(is_favorite, deleted_at, updated_at DESC);
CREATE INDEX idx_note_tags_tag ON note_tags(tag_id, note_id);
CREATE INDEX idx_attachments_note ON attachments(note_id, created_at);

PRAGMA user_version = 3;
