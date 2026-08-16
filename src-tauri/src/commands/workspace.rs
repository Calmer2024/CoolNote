use serde::Deserialize;

use crate::app_state::AppState;
use crate::application::workspace_service::{
    BatchAction, JottingSnapshot, NoteQuery, WorkspaceSnapshot,
};
use crate::commands::notes::CommandError;
use crate::domain::note::{
    Attachment, Category, Jotting, JottingFolder, Note, NoteSummary, Page, SearchResult,
};

#[tauri::command]
pub async fn get_workspace_snapshot(
    state: tauri::State<'_, AppState>,
) -> Result<WorkspaceSnapshot, CommandError> {
    run(state, |services| services.workspace.snapshot()).await
}

#[tauri::command]
pub async fn query_notes(
    state: tauri::State<'_, AppState>,
    query: NoteQuery,
) -> Result<Page<NoteSummary>, CommandError> {
    run(state, move |services| services.workspace.list_notes(query)).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteRequest {
    pub category_id: Option<String>,
}

#[tauri::command]
pub async fn create_workspace_note(
    state: tauri::State<'_, AppState>,
    request: CreateNoteRequest,
) -> Result<Note, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_note(request.category_id.as_deref(), "", None)
    })
    .await
}

#[tauri::command]
pub async fn get_workspace_note(
    state: tauri::State<'_, AppState>,
    note_id: String,
) -> Result<Note, CommandError> {
    run(state, move |services| services.workspace.get_note(&note_id)).await
}

#[tauri::command]
pub async fn batch_notes(
    state: tauri::State<'_, AppState>,
    note_ids: Vec<String>,
    action: BatchAction,
) -> Result<usize, CommandError> {
    run(state, move |services| {
        services.workspace.batch_action(&note_ids, action)
    })
    .await
}

#[tauri::command]
pub async fn empty_trash(state: tauri::State<'_, AppState>) -> Result<usize, CommandError> {
    run(state, move |services| services.workspace.empty_trash()).await
}

#[tauri::command]
pub async fn move_notes(
    state: tauri::State<'_, AppState>,
    note_ids: Vec<String>,
    category_id: String,
) -> Result<usize, CommandError> {
    run(state, move |services| {
        services.workspace.move_notes(&note_ids, &category_id)
    })
    .await
}

#[tauri::command]
pub async fn create_category(
    state: tauri::State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> Result<Category, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_category(&name, parent_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn rename_category(
    state: tauri::State<'_, AppState>,
    category_id: String,
    name: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.rename_category(&category_id, &name)
    })
    .await
}

#[tauri::command]
pub async fn update_category_appearance(
    state: tauri::State<'_, AppState>,
    category_id: String,
    icon_name: String,
    color: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services
            .workspace
            .update_category_appearance(&category_id, &icon_name, &color)
    })
    .await
}

#[tauri::command]
pub async fn delete_category(
    state: tauri::State<'_, AppState>,
    category_id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_category(&category_id)
    })
    .await
}

#[tauri::command]
pub async fn set_note_mood(
    state: tauri::State<'_, AppState>,
    note_id: String,
    mood: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.set_note_mood(&note_id, mood.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn global_search(
    state: tauri::State<'_, AppState>,
    query: String,
    limit: i64,
) -> Result<Vec<SearchResult>, CommandError> {
    run(state, move |services| {
        let mut results = services.workspace.global_search(&query, limit)?;
        results.extend(services.galleries.search(&query, limit)?);
        results.extend(services.tasks.search(&query, limit)?);
        results.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
        results.truncate(limit.clamp(1, 100) as usize);
        Ok(results)
    })
    .await
}

#[tauri::command]
pub async fn save_attachment(
    state: tauri::State<'_, AppState>,
    note_id: String,
    file_name: String,
    media_type: String,
    data_base64: String,
) -> Result<Attachment, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .save_attachment(&note_id, &file_name, &media_type, &data_base64)
    })
    .await
}

#[tauri::command]
pub async fn list_attachments(
    state: tauri::State<'_, AppState>,
    note_id: String,
) -> Result<Vec<Attachment>, CommandError> {
    run(state, move |services| {
        services.workspace.list_attachments(&note_id)
    })
    .await
}

#[tauri::command]
pub async fn delete_attachment(
    state: tauri::State<'_, AppState>,
    attachment_id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_attachment(&attachment_id)
    })
    .await
}

#[tauri::command]
pub async fn reveal_attachment(
    state: tauri::State<'_, AppState>,
    attachment_id: String,
) -> Result<bool, CommandError> {
    run(state, move |services| {
        let path = services.workspace.attachment_path(&attachment_id)?;
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer.exe")
                .arg("/select,")
                .arg(&path)
                .spawn()?;
            Ok(true)
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = path;
            Ok(false)
        }
    })
    .await
}

#[tauri::command]
pub async fn export_notes(
    state: tauri::State<'_, AppState>,
    note_ids: Vec<String>,
    format: String,
) -> Result<String, CommandError> {
    run(state, move |services| {
        services.workspace.export_notes(&note_ids, &format)
    })
    .await
}

#[tauri::command]
pub async fn import_notes(
    state: tauri::State<'_, AppState>,
    content: String,
    format: String,
    category_id: Option<String>,
    title: Option<String>,
    document_json: Option<serde_json::Value>,
) -> Result<Vec<Note>, CommandError> {
    run(state, move |services| {
        services.workspace.import_notes(
            &content,
            &format,
            category_id.as_deref(),
            title.as_deref(),
            document_json,
        )
    })
    .await
}

#[tauri::command]
pub async fn get_jotting_snapshot(
    state: tauri::State<'_, AppState>,
) -> Result<JottingSnapshot, CommandError> {
    run(state, |services| services.workspace.jotting_snapshot()).await
}

#[tauri::command]
pub async fn create_jotting_folder(
    state: tauri::State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> Result<JottingFolder, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_jotting_folder(&name, parent_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn create_jotting(
    state: tauri::State<'_, AppState>,
    name: String,
    folder_id: Option<String>,
) -> Result<Jotting, CommandError> {
    run(state, move |services| {
        services
            .workspace
            .create_jotting(&name, folder_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn update_jotting(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: i64,
    name: String,
    content: String,
    cover: Option<String>,
    is_favorite: bool,
) -> Result<Jotting, CommandError> {
    run(state, move |services| {
        services.workspace.update_jotting(
            &id,
            base_revision,
            &name,
            &content,
            cover.as_deref(),
            is_favorite,
        )
    })
    .await
}

#[tauri::command]
pub async fn move_jotting(
    state: tauri::State<'_, AppState>,
    id: String,
    folder_id: Option<String>,
) -> Result<Jotting, CommandError> {
    run(state, move |services| {
        services.workspace.move_jotting(&id, folder_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn delete_jotting(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_jotting(&id)
    })
    .await
}

#[tauri::command]
pub async fn delete_jotting_folder(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services.workspace.delete_jotting_folder(&id)
    })
    .await
}

async fn run<T: Send + 'static>(
    state: tauri::State<'_, AppState>,
    operation: impl FnOnce(crate::app_state::AppServices) -> Result<T, crate::domain::error::AppError>
        + Send
        + 'static,
) -> Result<T, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || operation(state.services()?))
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}
