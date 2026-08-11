use std::io::Write;
use std::path::Path;
use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;
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
}

pub struct LibraryService;

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
            }
        };
        library.last_opened_at = now.clone();
        write_manifest(&manifest_path, &library)?;

        let database = Arc::new(Database::open(&checked_child(&root, "coolnote.db")?)?);
        database.with_write(|transaction| {
            transaction.execute(
                "INSERT OR IGNORE INTO libraries
                 (id, name, root_path, format_version, created_at, last_opened_at,
                  last_clean_shutdown_at, settings_json)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    library.id,
                    library.name,
                    library.root_path,
                    library.format_version,
                    library.created_at,
                    library.last_opened_at,
                    library.last_clean_shutdown_at,
                    library.settings_json,
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

        Ok(LibraryContext { library, database })
    }
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
