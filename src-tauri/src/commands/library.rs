use serde::Serialize;

use crate::app_state::AppState;
use crate::commands::notes::CommandError;
use crate::domain::note::Library;

#[tauri::command]
pub async fn initialize_library(
    state: tauri::State<'_, AppState>,
) -> Result<Library, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.services().map(|value| value.library))
        .await
        .map_err(|error| CommandError::join(error.to_string()))?
        .map_err(CommandError::from)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryInitialization {
    pub library: Library,
}
