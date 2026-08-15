use std::sync::Arc;

use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::document::{derive_plain_text, hash_document, validate_document};
use crate::domain::error::AppError;
use crate::infrastructure::database::Database;
use crate::infrastructure::recovery_store::{RecoveryRecord, RecoveryStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteRequest {
    pub note_id: String,
    pub base_revision: i64,
    pub client_transaction_id: String,
    pub title: String,
    pub document_json: serde_json::Value,
    pub markdown_snapshot: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteResult {
    pub note_id: String,
    pub revision: i64,
    pub updated_at: String,
    pub content_hash: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveFault {
    None,
    BeforeCommit,
}

#[derive(Debug, Clone)]
pub struct SaveService {
    library_id: String,
    database: Arc<Database>,
    recovery: RecoveryStore,
}

impl SaveService {
    pub fn new(library_id: String, database: Arc<Database>, recovery: RecoveryStore) -> Self {
        Self {
            library_id,
            database,
            recovery,
        }
    }

    pub fn recovery_store(&self) -> &RecoveryStore {
        &self.recovery
    }

    pub fn save_note(&self, request: SaveNoteRequest) -> Result<SaveNoteResult, AppError> {
        self.save_note_with_fault(request, SaveFault::None)
    }

    pub fn save_note_with_fault(
        &self,
        request: SaveNoteRequest,
        fault: SaveFault,
    ) -> Result<SaveNoteResult, AppError> {
        let document = validate_document(&request.document_json)?;
        let document_json = serde_json::to_value(&document)?;
        let serialized = serde_json::to_string(&document)?;
        let plain_text = derive_plain_text(&document);
        let markdown_snapshot = if request.markdown_snapshot.trim().is_empty() {
            format!("# {}\n\n{}\n", request.title, plain_text)
        } else {
            request.markdown_snapshot.clone()
        };
        let content_hash = hash_document(&document);

        let current = self.database.with_read(|connection| {
            connection
                .query_row(
                    "SELECT revision,title,content_hash,updated_at FROM notes WHERE id=?1 AND deleted_at IS NULL",
                    [&request.note_id],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                        ))
                    },
                )
                .map_err(|error| match error {
                    rusqlite::Error::QueryReturnedNoRows => AppError::NotFound(request.note_id.clone()),
                    other => AppError::Database(other),
                })
        })?;
        if current.0 != request.base_revision {
            return Err(AppError::RevisionConflict {
                note_id: request.note_id.clone(),
                expected: request.base_revision,
                current: current.0,
            });
        }
        if current.1 == request.title && current.2 == content_hash {
            return Ok(SaveNoteResult {
                note_id: request.note_id,
                revision: current.0,
                updated_at: current.3,
                content_hash,
            });
        }

        let updated_at = Utc::now().to_rfc3339();

        self.recovery
            .put(&RecoveryRecord {
                library_id: self.library_id.clone(),
                note_id: request.note_id.clone(),
                base_revision: request.base_revision,
                client_transaction_id: request.client_transaction_id.clone(),
                title: request.title.clone(),
                document_json,
                markdown_snapshot: markdown_snapshot.clone(),
                content_hash: content_hash.clone(),
                created_at: updated_at.clone(),
            })
            .map_err(|error| AppError::RecoveryWriteFailed(Box::new(error)))?;

        if fault == SaveFault::BeforeCommit {
            return Err(AppError::InjectedFailure);
        }

        let result = self.database.with_write(|transaction| {
            let changed = transaction.execute(
                "UPDATE notes SET title=?1, document_json=?2, plain_text=?3,
                 content_hash=?4, markdown_snapshot=?5, schema_version=1, revision=revision+1, updated_at=?6
                 WHERE id=?7 AND revision=?8 AND deleted_at IS NULL",
                params![
                    request.title,
                    serialized,
                    plain_text,
                    content_hash,
                    markdown_snapshot,
                    updated_at,
                    request.note_id,
                    request.base_revision,
                ],
            )?;
            if changed != 1 {
                let current = transaction
                    .query_row(
                        "SELECT revision FROM notes WHERE id=?1 AND deleted_at IS NULL",
                        [&request.note_id],
                        |row| row.get(0),
                    )
                    .map_err(|error| match error {
                        rusqlite::Error::QueryReturnedNoRows => {
                            AppError::NotFound(request.note_id.clone())
                        }
                        other => AppError::Database(other),
                    })?;
                return Err(AppError::RevisionConflict {
                    note_id: request.note_id.clone(),
                    expected: request.base_revision,
                    current,
                });
            }
            transaction.execute(
                "INSERT INTO note_versions(id,note_id,revision,title,markdown_snapshot,created_at) VALUES(?1,?2,?3,?4,?5,?6)",
                params![Uuid::new_v4().to_string(),request.note_id,request.base_revision+1,request.title,markdown_snapshot,updated_at],
            )?;
            Ok(SaveNoteResult {
                note_id: request.note_id.clone(),
                revision: request.base_revision + 1,
                updated_at: updated_at.clone(),
                content_hash: content_hash.clone(),
            })
        })?;

        self.recovery.remove(&request.note_id)?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::workspace_service::WorkspaceService;
    use crate::domain::note::UNCATEGORIZED_ID;
    use crate::infrastructure::database::Database;

    #[test]
    fn identical_save_keeps_revision_and_updated_at() {
        let directory = tempfile::tempdir().expect("temporary library");
        let database =
            Arc::new(Database::open(&directory.path().join("coolnote.db")).expect("database"));
        let recovery =
            RecoveryStore::new(directory.path().join("recovery")).expect("recovery store");
        database.with_write(|transaction| {
            transaction.execute(
                "INSERT INTO categories(id,parent_id,name,icon_name,color,sort_order,created_at,updated_at,deleted_at)
                 VALUES(?1,NULL,'未分类','folder','#1687e8',0,'now','now',NULL)",
                [UNCATEGORIZED_ID],
            )?;
            Ok(())
        }).expect("uncategorized category");
        let workspace =
            WorkspaceService::new(database.clone(), directory.path().join("attachments"));
        let note = workspace
            .create_note(None, "未修改笔记", None)
            .expect("note");
        let service = SaveService::new(Uuid::new_v4().to_string(), database, recovery);
        let saved = service
            .save_note(SaveNoteRequest {
                note_id: note.id.clone(),
                base_revision: note.revision,
                client_transaction_id: Uuid::new_v4().to_string(),
                title: note.title.clone(),
                document_json: serde_json::to_value(&note.document).expect("document json"),
                markdown_snapshot: format!("# {}\n\n{}\n", note.title, note.plain_text),
            })
            .expect("idempotent save");

        assert_eq!(saved.revision, note.revision);
        assert_eq!(saved.updated_at, note.updated_at);
        assert_eq!(
            workspace
                .get_note(&note.id)
                .expect("reloaded note")
                .updated_at,
            note.updated_at
        );
    }
}
