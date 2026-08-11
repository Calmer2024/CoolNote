use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::application::recovery_service::{classify_recovery, RecoveryDecision};
use crate::application::save_service::{SaveNoteRequest, SaveNoteResult};
use crate::domain::error::AppError;
use crate::domain::note::{Note, NoteSummary, Page};
use crate::infrastructure::recovery_store::RecoveryRecord;

#[derive(Debug, Clone, Serialize)]
pub struct CommandError {
    pub code: String,
    pub message: String,
    pub retryable: bool,
}

impl CommandError {
    pub fn join(message: String) -> Self {
        Self {
            code: "task_join_failed".to_owned(),
            message,
            retryable: true,
        }
    }
}

impl From<AppError> for CommandError {
    fn from(error: AppError) -> Self {
        let (code, retryable) = match &error {
            AppError::RevisionConflict { .. } => ("revision_conflict", false),
            AppError::NotFound(_) => ("not_found", false),
            AppError::UnsupportedNode(_) | AppError::UnsupportedSchema(_) => {
                ("unsupported_document", false)
            }
            AppError::InjectedFailure => ("injected_failure", true),
            _ => ("local_operation_failed", true),
        };
        Self {
            code: code.to_owned(),
            message: error.to_string(),
            retryable,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryCandidate {
    pub decision: RecoveryDecision,
    pub database_revision: i64,
    pub draft: RecoveryRecord,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResolveRecoveryAction {
    RestoreDraft,
    KeepDatabaseVersion,
}

#[tauri::command]
pub async fn list_notes(
    state: tauri::State<'_, AppState>,
    offset: i64,
    limit: i64,
) -> Result<Page<NoteSummary>, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.services()?.notes.list_notes(offset, limit))
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn get_note(
    state: tauri::State<'_, AppState>,
    note_id: String,
) -> Result<Note, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.services()?.notes.get_note(&note_id))
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn create_note(state: tauri::State<'_, AppState>) -> Result<Note, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.services()?.notes.create_note())
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn save_note(
    state: tauri::State<'_, AppState>,
    request: SaveNoteRequest,
) -> Result<SaveNoteResult, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.services()?.saves.save_note(request))
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn list_recovery_candidates(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RecoveryCandidate>, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let services = state.services()?;
        let mut candidates = Vec::new();
        for record in services.recovery.list()? {
            let note = services.notes.get_note(&record.note_id)?;
            let decision = classify_recovery(note.revision, &note.content_hash, &record);
            if decision == RecoveryDecision::DiscardDuplicate {
                services.recovery.remove(&record.note_id)?;
                continue;
            }
            candidates.push(RecoveryCandidate {
                decision,
                database_revision: note.revision,
                draft: record,
            });
        }
        Ok::<Vec<RecoveryCandidate>, AppError>(candidates)
    })
    .await
    .map_err(|error| CommandError::join(error.to_string()))?
    .map_err(CommandError::from)
}

#[tauri::command]
pub async fn resolve_recovery(
    state: tauri::State<'_, AppState>,
    note_id: String,
    action: ResolveRecoveryAction,
) -> Result<Option<RecoveryRecord>, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let services = state.services()?;
        match action {
            ResolveRecoveryAction::RestoreDraft => services.recovery.get(&note_id),
            ResolveRecoveryAction::KeepDatabaseVersion => {
                services.recovery.remove(&note_id)?;
                Ok(None)
            }
        }
    })
    .await
    .map_err(|error| CommandError::join(error.to_string()))?
    .map_err(CommandError::from)
}
