CREATE TABLE jotting_folders (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES jotting_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE jottings (
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES jotting_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  cover TEXT,
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_jotting_folders_parent_sort ON jotting_folders(parent_id, sort_order, name);
CREATE INDEX idx_jottings_folder_sort ON jottings(folder_id, sort_order, name);

PRAGMA user_version = 5;
