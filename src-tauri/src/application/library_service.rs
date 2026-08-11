use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;
use serde_json::Value;
use uuid::Uuid;

use crate::domain::error::AppError;
use crate::domain::note::Library;
use crate::domain::note::UNCATEGORIZED_ID;
use crate::infrastructure::database::Database;
use crate::infrastructure::paths::{checked_child, prepare_library_root};

#[derive(Debug)]
pub struct LibraryContext {
    pub library: Library,
    pub database: Arc<Database>,
    pub settings: LibrarySettingsService,
}

pub struct LibraryService;

#[derive(Debug, Clone)]
pub struct LibrarySettingsService {
    library_id: String,
    library_root: PathBuf,
    database: Arc<Database>,
}

impl LibrarySettingsService {
    fn new(library: &Library, database: Arc<Database>) -> Self {
        Self {
            library_id: library.id.clone(),
            library_root: PathBuf::from(&library.root_path),
            database,
        }
    }

    pub fn current(&self) -> Result<Library, AppError> {
        let library_id = self.library_id.clone();
        self.database.with_read(|connection| {
            connection
                .query_row(
                    "SELECT id, name, root_path, format_version, created_at, last_opened_at,
                            last_clean_shutdown_at, settings_json, settings_revision
                     FROM libraries WHERE id=?1",
                    params![library_id],
                    |row| {
                        Ok(Library {
                            id: row.get(0)?,
                            name: row.get(1)?,
                            root_path: row.get(2)?,
                            format_version: row.get(3)?,
                            created_at: row.get(4)?,
                            last_opened_at: row.get(5)?,
                            last_clean_shutdown_at: row.get(6)?,
                            settings_json: row.get(7)?,
                            settings_revision: row.get(8)?,
                        })
                    },
                )
                .map_err(AppError::from)
        })
    }

    pub fn update(
        &self,
        base_settings_revision: i64,
        settings_json: &str,
    ) -> Result<Library, AppError> {
        validate_settings_json(settings_json)?;
        let library_id = self.library_id.clone();
        self.database.with_write(|transaction| {
            let current = transaction.query_row(
                "SELECT settings_revision FROM libraries WHERE id=?1",
                params![library_id],
                |row| row.get::<_, i64>(0),
            )?;
            if current != base_settings_revision {
                return Err(AppError::SettingsRevisionConflict {
                    library_id: self.library_id.clone(),
                    expected: base_settings_revision,
                    current,
                });
            }
            transaction.execute(
                "UPDATE libraries
                 SET settings_json=?1, settings_revision=settings_revision + 1
                 WHERE id=?2",
                params![settings_json, self.library_id],
            )?;
            Ok(())
        })?;

        let library = self.current()?;
        write_manifest(&self.library_root.join("library.json"), &library)?;
        Ok(library)
    }
}

impl LibraryService {
    pub fn open_or_create(root: &Path) -> Result<LibraryContext, AppError> {
        let root = prepare_library_root(root)?;
        std::fs::create_dir_all(checked_child(&root, "recovery")?)?;
        std::fs::create_dir_all(checked_child(&root, "attachments")?)?;

        let manifest_path = checked_child(&root, "library.json")?;
        let now = Utc::now().to_rfc3339();
        let mut library = if manifest_path.exists() {
            serde_json::from_slice::<Library>(&std::fs::read(&manifest_path)?)?
        } else {
            Library {
                id: Uuid::new_v4().to_string(),
                name: root
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("CoolNote")
                    .to_owned(),
                root_path: root.to_string_lossy().into_owned(),
                format_version: 1,
                created_at: now.clone(),
                last_opened_at: now.clone(),
                last_clean_shutdown_at: None,
                settings_json: "{}".to_owned(),
                settings_revision: 1,
            }
        };
        library.last_opened_at = now.clone();

        let database = Arc::new(Database::open(&checked_child(&root, "coolnote.db")?)?);
        database.with_write(|transaction| {
            transaction.execute(
                "INSERT OR IGNORE INTO libraries
                 (id, name, root_path, format_version, created_at, last_opened_at,
                  last_clean_shutdown_at, settings_json, settings_revision)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    library.id,
                    library.name,
                    library.root_path,
                    library.format_version,
                    library.created_at,
                    library.last_opened_at,
                    library.last_clean_shutdown_at,
                    library.settings_json,
                    library.settings_revision,
                ],
            )?;
            transaction.execute(
                "INSERT OR IGNORE INTO categories
                 (id, parent_id, name, icon_name, color, sort_order, created_at, updated_at, deleted_at)
                 VALUES (?1, NULL, '未分类', 'folder', '#1687e8', 0, ?2, ?2, NULL)",
                params![UNCATEGORIZED_ID, now],
            )?;
            transaction.execute(
                "UPDATE libraries SET last_opened_at=?1 WHERE id=?2",
                params![library.last_opened_at, library.id],
            )?;
            Ok(())
        })?;

        let settings = LibrarySettingsService::new(&library, database.clone());
        library = settings.current()?;
        write_manifest(&manifest_path, &library)?;

        Ok(LibraryContext {
            library,
            database,
            settings,
        })
    }
}

fn validate_settings_json(settings_json: &str) -> Result<(), AppError> {
    if settings_json.len() > 64 * 1024 {
        return Err(AppError::InvalidLibrarySettings(
            "settings JSON exceeds 64 KiB".to_owned(),
        ));
    }
    let value: Value = serde_json::from_str(settings_json)?;
    let object = value.as_object().ok_or_else(|| {
        AppError::InvalidLibrarySettings("settings JSON must be an object".to_owned())
    })?;
    if let Some(theme) = object.get("theme") {
        match theme.as_str() {
            Some("system" | "light" | "dark") => {}
            _ => {
                return Err(AppError::InvalidLibrarySettings(
                    "theme must be system, light, or dark".to_owned(),
                ));
            }
        }
    }
    Ok(())
}

fn write_manifest(path: &Path, library: &Library) -> Result<(), AppError> {
    let parent = path.parent().ok_or_else(|| {
        AppError::InvalidLibrary("library manifest has no parent directory".to_owned())
    })?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    serde_json::to_writer_pretty(&mut temporary, library)?;
    temporary.write_all(b"\n")?;
    temporary.as_file_mut().sync_all()?;
    temporary.persist(path).map_err(|error| error.error)?;
    Ok(())
}
