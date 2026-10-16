use crate::{
    commands::notes::CommandError,
    integration::settings::{IntegrationManager, IntegrationStatus, UpdateSettings},
};

#[tauri::command]
pub async fn get_integration_status(
    state: tauri::State<'_, IntegrationManager>,
) -> Result<IntegrationStatus, CommandError> {
    state.status().await.map_err(CommandError::from)
}
#[tauri::command]
pub async fn update_integration_settings(
    state: tauri::State<'_, IntegrationManager>,
    request: UpdateSettings,
) -> Result<IntegrationStatus, CommandError> {
    state.update(request).await.map_err(CommandError::from)
}
#[tauri::command]
pub async fn get_integration_client_config(
    state: tauri::State<'_, IntegrationManager>,
    kind: String,
) -> Result<String, CommandError> {
    state.client_config(&kind).await.map_err(CommandError::from)
}
