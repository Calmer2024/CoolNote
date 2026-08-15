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

        assert_eq!(database.user_version().expect("user version"), 12);
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
        assert_eq!(database.user_version().expect("user version"), 12);
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
