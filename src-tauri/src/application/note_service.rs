use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use crate::domain::document::{
    derive_plain_text, empty_document, hash_document, validate_document,
};
use crate::domain::error::AppError;
use crate::domain::note::{Note, NoteSummary, Page, UNCATEGORIZED_ID};
use crate::infrastructure::database::Database;

#[derive(Debug, Clone)]
pub struct NoteService {
    database: Arc<Database>,
}

impl NoteService {
    pub fn new(database: Arc<Database>) -> Self {
        Self { database }
    }

    pub fn create_note(&self) -> Result<Note, AppError> {
        let id = Uuid::new_v4().to_string();
        let document = empty_document();
        let document_json = serde_json::to_string(&document)?;
        let plain_text = derive_plain_text(&document);
        let content_hash = hash_document(&document);
        let now = Utc::now().to_rfc3339();

        self.database.with_write(|transaction| {
            transaction.execute(
                "INSERT INTO notes
                 (id, category_id, title, document_json, plain_text, schema_version,
                  content_hash, revision, is_favorite, is_pinned, is_archived,
                  created_at, updated_at, deleted_at)
                 VALUES (?1, ?2, '', ?3, ?4, 1, ?5, 1, 0, 0, 0, ?6, ?6, NULL)",
                params![
                    id,
                    UNCATEGORIZED_ID,
                    document_json,
                    plain_text,
                    content_hash,
                    now
                ],
            )?;
            Ok(())
        })?;

        self.get_note(&id)
    }

    pub fn list_notes(&self, offset: i64, limit: i64) -> Result<Page<NoteSummary>, AppError> {
        let safe_offset = offset.max(0);
        let safe_limit = limit.clamp(1, 200);
        self.database.with_read(|connection| {
            let total = connection.query_row(
                "SELECT COUNT(*) FROM notes WHERE deleted_at IS NULL",
                [],
                |row| row.get(0),
            )?;
            let mut statement = connection.prepare(
                "SELECT id, title, substr(plain_text, 1, 240), revision, updated_at
                 FROM notes WHERE deleted_at IS NULL
                 ORDER BY updated_at DESC, id ASC LIMIT ?1 OFFSET ?2",
            )?;
            let items = statement
                .query_map(params![safe_limit, safe_offset], |row| {
                    Ok(NoteSummary {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        excerpt: row.get(2)?,
                        revision: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Page { items, total })
        })
    }

    pub fn get_note(&self, note_id: &str) -> Result<Note, AppError> {
        self.database.with_read(|connection| {
            let raw = connection
                .query_row(
                    "SELECT id, category_id, title, document_json, plain_text,
                            content_hash, revision, created_at, updated_at
                     FROM notes WHERE id=?1 AND deleted_at IS NULL",
                    [note_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, String>(4)?,
                            row.get::<_, String>(5)?,
                            row.get::<_, i64>(6)?,
                            row.get::<_, String>(7)?,
                            row.get::<_, String>(8)?,
                        ))
                    },
                )
                .map_err(|error| match error {
                    rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(note_id.to_owned()),
                    other => AppError::Database(other),
                })?;
            let document_json = serde_json::from_str(&raw.3)?;
            let document = validate_document(&document_json)?;
            Ok(Note {
                id: raw.0,
                category_id: raw.1,
                title: raw.2,
                document,
                plain_text: raw.4,
                content_hash: raw.5,
                revision: raw.6,
                created_at: raw.7,
                updated_at: raw.8,
            })
        })
    }
}
