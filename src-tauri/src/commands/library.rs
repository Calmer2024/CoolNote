use serde::{Deserialize, Serialize};

use crate::app_state::AppState;
use crate::commands::notes::CommandError;
use crate::domain::note::Library;

#[tauri::command]
pub async fn initialize_library(
    state: tauri::State<'_, AppState>,
) -> Result<Library, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.services()?.settings.current())
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLibrarySettingsRequest {
    pub base_settings_revision: i64,
    pub settings_json: String,
}

#[tauri::command]
pub async fn update_library_settings(
    state: tauri::State<'_, AppState>,
    request: UpdateLibrarySettingsRequest,
) -> Result<Library, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state
            .services()?
            .settings
            .update(request.base_settings_revision, &request.settings_json)
    })
    .await
    .map_err(|error| CommandError::join(error.to_string()))?
    .map_err(CommandError::from)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInitialization {
    pub library: Library,
}
