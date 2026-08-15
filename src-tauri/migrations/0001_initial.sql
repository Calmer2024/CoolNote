PRAGMA foreign_keys = ON;

CREATE TABLE libraries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  format_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_opened_at TEXT NOT NULL,
  last_clean_shutdown_at TEXT,
  settings_json TEXT NOT NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id),
  name TEXT NOT NULL,
  icon_name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  title TEXT NOT NULL DEFAULT '',
  document_json TEXT NOT NULL,
  plain_text TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  revision INTEGER NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX idx_notes_updated_at ON notes(deleted_at, updated_at DESC, id ASC);

PRAGMA user_version = 1;
