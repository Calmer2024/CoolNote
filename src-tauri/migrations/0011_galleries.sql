CREATE TABLE galleries (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  introduction TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_token TEXT
);

CREATE TABLE gallery_assets (
  id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  original_file_name TEXT NOT NULL,
  media_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  relative_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE gallery_items (
  id TEXT PRIMARY KEY,
  gallery_id TEXT NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES gallery_assets(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  delete_token TEXT
);

CREATE INDEX idx_galleries_active_sort ON galleries(deleted_at, sort_order, name);
CREATE INDEX idx_gallery_items_gallery_sort ON gallery_items(gallery_id, deleted_at, sort_order);
CREATE INDEX idx_gallery_items_asset ON gallery_items(asset_id, deleted_at);
CREATE UNIQUE INDEX idx_gallery_items_active_unique
  ON gallery_items(gallery_id, asset_id) WHERE deleted_at IS NULL;

PRAGMA user_version = 11;
