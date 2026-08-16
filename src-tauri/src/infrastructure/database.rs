use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use rusqlite::{Connection, OpenFlags, Transaction};

use crate::domain::error::AppError;

const INITIAL_MIGRATION: &str = include_str!("../../migrations/0001_initial.sql");
const LIBRARY_SETTINGS_REVISION_MIGRATION: &str =
    include_str!("../../migrations/0002_library_settings_revision.sql");
const ORGANIZATION_AND_ATTACHMENTS_MIGRATION: &str =
    include_str!("../../migrations/0003_organization_and_attachments.sql");
const NOTE_SEARCH_FTS_MIGRATION: &str = include_str!("../../migrations/0004_note_search_fts.sql");
const JOTTINGS_MIGRATION: &str = include_str!("../../migrations/0005_jottings.sql");
const JOTTING_FAVORITES_MIGRATION: &str =
    include_str!("../../migrations/0006_jotting_favorites.sql");
const CATEGORY_PINNING_MIGRATION: &str = include_str!("../../migrations/0007_category_pinning.sql");
const NOTE_MARKDOWN_SNAPSHOTS_MIGRATION: &str =
    include_str!("../../migrations/0008_note_markdown_snapshots.sql");
const REMOVE_TAGS_MOOD_ATTACHMENT_DEDUPE_MIGRATION: &str =
    include_str!("../../migrations/0009_remove_tags_mood_attachment_dedupe.sql");
const REMOVE_PINNING_MIGRATION: &str = include_str!("../../migrations/0010_remove_pinning.sql");
const GALLERIES_MIGRATION: &str = include_str!("../../migrations/0011_galleries.sql");
const GALLERY_COVERS_MIGRATION: &str = include_str!("../../migrations/0012_gallery_covers.sql");
const TASKS_MIGRATION: &str = include_str!("../../migrations/0013_tasks.sql");
const BUILTIN_PRODUCT_GUIDE_MIGRATION: &str =
    include_str!("../../migrations/0014_builtin_product_guide.sql");
const PRODUCT_GUIDE_V2_MIGRATION: &str = include_str!("../../migrations/0015_product_guide_v2.sql");
const PRODUCT_GUIDE_MARKDOWN: &str = include_str!("../../../src/shared/product-guide.md");
const BUILT_IN_NOTE_ID: &str = "00000000-0000-4000-8000-000000000011";

fn product_guide_block_id(index: usize) -> String {
    format!("20000000-0000-4000-8000-{index:012}")
}

fn product_guide_document(markdown: &str) -> serde_json::Value {
    let lines = markdown.lines().collect::<Vec<_>>();
    let mut content = Vec::new();
    let mut cursor = 0;
    let mut block_index = 1;
    while cursor < lines.len() {
        let line = lines[cursor].trim();
        if line.is_empty() {
            cursor += 1;
            continue;
        }
        let heading_level = line.chars().take_while(|value| *value == '#').count();
        if (1..=5).contains(&heading_level) && line.chars().nth(heading_level) == Some(' ') {
            content.push(serde_json::json!({
                "type":"heading",
                "attrs":{"level":heading_level,"blockId":product_guide_block_id(block_index)},
                "content":[{"type":"text","text":line[heading_level + 1..].trim()}]
            }));
            block_index += 1;
            cursor += 1;
            continue;
        }
        if line.starts_with("- ") {
            let mut items = Vec::new();
            while cursor < lines.len() && lines[cursor].trim().starts_with("- ") {
                items.push(serde_json::json!({
                    "type":"listItem",
                    "content":[{"type":"paragraph","content":[{"type":"text","text":lines[cursor].trim()[2..].trim()}]}]
                }));
                cursor += 1;
            }
            content.push(serde_json::json!({
                "type":"bulletList",
                "attrs":{"blockId":product_guide_block_id(block_index)},
                "content":items
            }));
            block_index += 1;
            continue;
        }
        let mut paragraph = vec![line];
        cursor += 1;
        while cursor < lines.len() {
            let next = lines[cursor].trim();
            let next_heading = next.chars().take_while(|value| *value == '#').count();
            if next.is_empty()
                || next.starts_with("- ")
                || ((1..=5).contains(&next_heading) && next.chars().nth(next_heading) == Some(' '))
            {
                break;
            }
            paragraph.push(next);
            cursor += 1;
        }
        content.push(serde_json::json!({
            "type":"paragraph",
            "attrs":{"blockId":product_guide_block_id(block_index)},
            "content":[{"type":"text","text":paragraph.join(" ")}]
        }));
        block_index += 1;
    }
    serde_json::json!({"schemaVersion":1,"type":"doc","content":content})
}

#[derive(Debug)]
pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_FULL_MUTEX,
        )?;
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")?;

        let database = Self {
            connection: Mutex::new(connection),
        };
        database.apply_migrations()?;
        Ok(database)
    }

    fn lock(&self) -> Result<MutexGuard<'_, Connection>, AppError> {
        self.connection.lock().map_err(|_| AppError::PoisonedLock)
    }

    fn apply_migrations(&self) -> Result<(), AppError> {
        if self.user_version()? < 1 {
            self.lock()?.execute_batch(INITIAL_MIGRATION)?;
        }
        if self.user_version()? < 2 {
            self.lock()?
                .execute_batch(LIBRARY_SETTINGS_REVISION_MIGRATION)?;
        }
        if self.user_version()? < 3 {
            self.lock()?
                .execute_batch(ORGANIZATION_AND_ATTACHMENTS_MIGRATION)?;
        }
        if self.user_version()? < 4 {
            self.lock()?.execute_batch(NOTE_SEARCH_FTS_MIGRATION)?;
        }
        if self.user_version()? < 5 {
            self.lock()?.execute_batch(JOTTINGS_MIGRATION)?;
        }
        if self.user_version()? < 6 {
            self.lock()?.execute_batch(JOTTING_FAVORITES_MIGRATION)?;
        }
        if self.user_version()? < 7 {
            self.lock()?.execute_batch(CATEGORY_PINNING_MIGRATION)?;
        }
        if self.user_version()? < 8 {
            self.lock()?
                .execute_batch(NOTE_MARKDOWN_SNAPSHOTS_MIGRATION)?;
        }
        if self.user_version()? < 9 {
            self.lock()?
                .execute_batch(REMOVE_TAGS_MOOD_ATTACHMENT_DEDUPE_MIGRATION)?;
        }
        if self.user_version()? < 10 {
            self.lock()?
                .execute_batch("DROP INDEX IF EXISTS idx_notes_active_sort;")?;
            if self.column_exists("notes", "is_pinned")? {
                self.lock()?
                    .execute_batch("ALTER TABLE notes DROP COLUMN is_pinned;")?;
            }
            if self.column_exists("categories", "is_pinned")? {
                self.lock()?
                    .execute_batch("ALTER TABLE categories DROP COLUMN is_pinned;")?;
            }
            self.lock()?.execute_batch(REMOVE_PINNING_MIGRATION)?;
        }
        if self.user_version()? < 11 {
            self.lock()?.execute_batch(GALLERIES_MIGRATION)?;
        }
        if self.user_version()? < 12 {
            self.lock()?.execute_batch(GALLERY_COVERS_MIGRATION)?;
        }
        if self.user_version()? < 13 {
            self.lock()?.execute_batch(TASKS_MIGRATION)?;
        }
        if self.user_version()? < 14 {
            self.lock()?
                .execute_batch(BUILTIN_PRODUCT_GUIDE_MIGRATION)?;
        }
        if self.user_version()? < 15 {
            let value = product_guide_document(PRODUCT_GUIDE_MARKDOWN);
            let document = crate::domain::document::validate_document(&value)?;
            let document_json = serde_json::to_string(&document)?;
            let plain_text = crate::domain::document::derive_plain_text(&document);
            let content_hash = crate::domain::document::hash_document(&document);
            let mut connection = self.lock()?;
            let transaction = connection.transaction()?;
            transaction.execute_batch(PRODUCT_GUIDE_V2_MIGRATION)?;
            transaction.execute(
                "UPDATE notes SET title='欢迎使用 CoolNote',document_json=?1,plain_text=?2,markdown_snapshot=?3,content_hash=?4,schema_version=1,revision=revision+1,updated_at='2026-08-16T00:00:00Z',deleted_at=NULL,is_archived=0 WHERE id=?5",
                rusqlite::params![document_json, plain_text, PRODUCT_GUIDE_MARKDOWN.trim(), content_hash, BUILT_IN_NOTE_ID],
            )?;
            transaction.pragma_update(None, "user_version", 15)?;
            transaction.commit()?;
        }
        Ok(())
    }

    pub fn with_write<T>(
        &self,
        operation: impl FnOnce(&Transaction<'_>) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction()?;
        let value = operation(&transaction)?;
        transaction.commit()?;
        Ok(value)
    }

    pub fn with_read<T>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let connection = self.lock()?;
        operation(&connection)
    }

    pub fn user_version(&self) -> Result<i64, AppError> {
        self.query_i64("PRAGMA user_version")
    }

    pub fn query_i64(&self, sql: &str) -> Result<i64, AppError> {
        Ok(self.lock()?.query_row(sql, [], |row| row.get(0))?)
    }

    pub fn query_text(&self, sql: &str) -> Result<String, AppError> {
        Ok(self.lock()?.query_row(sql, [], |row| row.get(0))?)
    }

    fn column_exists(&self, table: &str, column: &str) -> Result<bool, AppError> {
        let connection = self.lock()?;
        let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(columns.iter().any(|value| value == column))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn column_exists(database: &Database, table: &str, column: &str) -> bool {
        database
            .with_read(|connection| {
                let mut statement = connection.prepare(&format!("PRAGMA table_info({table})"))?;
                let names = statement
                    .query_map([], |row| row.get::<_, String>(1))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(names.iter().any(|name| name == column))
            })
            .expect("table metadata should be readable")
    }

    #[test]
    fn fresh_database_applies_the_complete_schema() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let database = Database::open(&directory.path().join("coolnote.db"))
            .expect("fresh database should open");

        assert_eq!(database.user_version().expect("user version"), 15);
        assert!(column_exists(&database, "tasks", "importance"));
        assert!(column_exists(&database, "galleries", "introduction"));
        assert!(column_exists(&database, "galleries", "cover"));
        assert!(column_exists(&database, "jottings", "is_favorite"));
        assert!(!column_exists(&database, "categories", "is_pinned"));
        assert!(!column_exists(&database, "notes", "is_pinned"));
        assert!(column_exists(&database, "notes", "markdown_snapshot"));
        assert!(column_exists(&database, "notes", "mood"));
        assert!(column_exists(&database, "attachments", "content_hash"));
        assert_eq!(
            database
                .query_i64(
                    "SELECT COUNT(*) FROM notes WHERE id='00000000-0000-4000-8000-000000000011'"
                )
                .expect("built-in guide"),
            1
        );
        assert_eq!(
            database
                .query_i64(
                    "SELECT COUNT(*) FROM categories WHERE name='我的文件' AND deleted_at IS NULL"
                )
                .expect("single built-in category"),
            1
        );
        assert_eq!(
            database
                .query_text(
                    "SELECT category_id FROM notes WHERE id='00000000-0000-4000-8000-000000000011'"
                )
                .expect("guide category"),
            "00000000-0000-4000-8000-000000000001"
        );
        assert!(database
            .query_text(
                "SELECT plain_text FROM notes WHERE id='00000000-0000-4000-8000-000000000011'"
            )
            .expect("guide content")
            .contains("快捷键速查"));
        assert_eq!(
            database
                .query_i64("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tags'")
                .expect("tags removed"),
            0
        );
        assert_eq!(database.query_i64("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='note_versions'").expect("version table"),1);
    }

    #[test]
    fn version_five_database_upgrades_in_place_without_losing_jottings() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("coolnote.db");
        let connection = Connection::open(&path).expect("legacy database");
        connection
            .execute_batch(INITIAL_MIGRATION)
            .expect("initial migration");
        connection
            .execute_batch(LIBRARY_SETTINGS_REVISION_MIGRATION)
            .expect("settings migration");
        connection
            .execute_batch(ORGANIZATION_AND_ATTACHMENTS_MIGRATION)
            .expect("organization migration");
        connection
            .execute_batch(NOTE_SEARCH_FTS_MIGRATION)
            .expect("search migration");
        connection
            .execute_batch(JOTTINGS_MIGRATION)
            .expect("jottings migration");
        connection
            .execute(
                "INSERT INTO jottings (id, name, content, sort_order, revision, created_at, updated_at) \
                 VALUES ('upgrade-proof', '保留的小记.md', '<p>仍然存在</p>', 0, 3, '2026-08-13', '2026-08-13')",
                [],
            )
            .expect("legacy jotting");
        drop(connection);

        let database = Database::open(&path).expect("version five database should upgrade");
        assert_eq!(database.user_version().expect("user version"), 15);
        assert!(column_exists(&database, "jottings", "is_favorite"));
        assert_eq!(
            database
                .query_i64("SELECT COUNT(*) FROM jottings WHERE id = 'upgrade-proof'")
                .expect("preserved jotting count"),
            1
        );
        assert_eq!(
            database
                .query_i64("SELECT is_favorite FROM jottings WHERE id = 'upgrade-proof'")
                .expect("favorite default"),
            0
        );
    }

    #[test]
    fn version_fourteen_duplicate_my_files_categories_are_merged_in_place() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("coolnote.db");
        let connection = Connection::open(&path).expect("legacy database");
        for migration in [
            INITIAL_MIGRATION,
            LIBRARY_SETTINGS_REVISION_MIGRATION,
            ORGANIZATION_AND_ATTACHMENTS_MIGRATION,
            NOTE_SEARCH_FTS_MIGRATION,
            JOTTINGS_MIGRATION,
            JOTTING_FAVORITES_MIGRATION,
            CATEGORY_PINNING_MIGRATION,
            NOTE_MARKDOWN_SNAPSHOTS_MIGRATION,
            REMOVE_TAGS_MOOD_ATTACHMENT_DEDUPE_MIGRATION,
        ] {
            connection
                .execute_batch(migration)
                .expect("legacy migration");
        }
        connection
            .execute_batch("DROP INDEX IF EXISTS idx_notes_active_sort;")
            .expect("legacy index removal");
        for migration in [
            REMOVE_PINNING_MIGRATION,
            GALLERIES_MIGRATION,
            GALLERY_COVERS_MIGRATION,
            TASKS_MIGRATION,
        ] {
            connection
                .execute_batch(migration)
                .expect("legacy migration");
        }
        connection.execute("UPDATE categories SET name='我的文件',color='#58aaf0' WHERE id='00000000-0000-4000-8000-000000000001'",[]).expect("existing category");
        connection.execute("INSERT INTO categories(id,parent_id,name,icon_name,color,sort_order,created_at,updated_at,deleted_at) VALUES('00000000-0000-4000-8000-000000000010',NULL,'我的文件','book-open-text','#1687e8',-100,'2026-08-16','2026-08-16',NULL)",[]).expect("duplicate category");
        let legacy_document = serde_json::json!({"schemaVersion":1,"type":"doc","content":[{"type":"paragraph","attrs":{"blockId":"10000000-0000-4000-8000-000000000001"},"content":[{"type":"text","text":"简版介绍"}]}]}).to_string();
        connection.execute("INSERT INTO notes(id,category_id,title,document_json,plain_text,markdown_snapshot,schema_version,content_hash,revision,is_favorite,is_archived,created_at,updated_at,deleted_at,mood) VALUES(?1,'00000000-0000-4000-8000-000000000010','欢迎使用 CoolNote',?2,'简版介绍','# 简版介绍',1,'legacy',1,0,0,'2026-08-16','2026-08-16',NULL,NULL)",rusqlite::params![BUILT_IN_NOTE_ID,legacy_document]).expect("legacy guide");
        connection.execute("INSERT INTO notes(id,category_id,title,document_json,plain_text,markdown_snapshot,schema_version,content_hash,revision,is_favorite,is_archived,created_at,updated_at,deleted_at,mood) VALUES('user-note','00000000-0000-4000-8000-000000000010','用户笔记',?1,'保留我','# 保留我',1,'user',1,0,0,'2026-08-16','2026-08-16',NULL,NULL)",[legacy_document]).expect("legacy user note");
        connection
            .pragma_update(None, "user_version", 14)
            .expect("legacy version");
        drop(connection);

        let database = Database::open(&path).expect("version fourteen database should upgrade");
        assert_eq!(database.user_version().expect("user version"), 15);
        assert_eq!(
            database
                .query_i64(
                    "SELECT COUNT(*) FROM categories WHERE name='我的文件' AND deleted_at IS NULL"
                )
                .expect("one my files category"),
            1
        );
        assert_eq!(database.query_i64("SELECT COUNT(*) FROM categories WHERE id='00000000-0000-4000-8000-000000000010'").expect("duplicate removed"),0);
        assert_eq!(
            database
                .query_text("SELECT category_id FROM notes WHERE id='user-note'")
                .expect("user note moved"),
            "00000000-0000-4000-8000-000000000001"
        );
        assert!(database
            .query_text(
                "SELECT plain_text FROM notes WHERE id='00000000-0000-4000-8000-000000000011'"
            )
            .expect("expanded guide")
            .contains("快捷键速查"));
    }

    #[test]
    fn moving_a_jotting_persists_its_destination_folder() {
        let directory = tempfile::tempdir().expect("temporary directory");
        let database = Database::open(&directory.path().join("coolnote.db"))
            .expect("fresh database should open");
        database
            .with_write(|transaction| {
                transaction.execute(
                    "INSERT INTO jotting_folders (id, name, sort_order, created_at, updated_at) VALUES ('folder-a', '目标', 1, 'now', 'now')",
                    [],
                )?;
                transaction.execute(
                    "INSERT INTO jottings (id, name, sort_order, created_at, updated_at) VALUES ('jot-a', '移动.md', 1, 'now', 'now')",
                    [],
                )?;
                transaction.execute(
                    "UPDATE jottings SET folder_id='folder-a' WHERE id='jot-a'",
                    [],
                )?;
                Ok(())
            })
            .expect("move transaction");

        assert_eq!(
            database
                .query_text("SELECT folder_id FROM jottings WHERE id='jot-a'")
                .expect("folder destination"),
            "folder-a"
        );
    }
}
