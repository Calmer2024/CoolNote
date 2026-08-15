use crate::app_state::AppState;
use crate::commands::notes::CommandError;
use crate::domain::gallery::{
    GalleryAssetData, GalleryImportResult, GalleryItem, GallerySummary, GalleryTransferResult,
};
use crate::domain::note::Page;

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

#[tauri::command]
pub async fn list_galleries(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<GallerySummary>, CommandError> {
    run(state, |services| services.galleries.list()).await
}
#[tauri::command]
pub async fn create_gallery(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<GallerySummary, CommandError> {
    run(state, move |services| services.galleries.create(&name)).await
}
#[tauri::command]
pub async fn update_gallery(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: i64,
    name: String,
    introduction: String,
    cover: Option<String>,
) -> Result<GallerySummary, CommandError> {
    run(state, move |services| {
        services
            .galleries
            .update(&id, base_revision, &name, &introduction, cover.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn import_gallery_data(
    state: tauri::State<'_, AppState>,
    gallery_id: String,
    file_name: String,
    data_url: String,
) -> Result<GalleryImportResult, CommandError> {
    run(state, move |services| {
        services
            .galleries
            .import_data(&gallery_id, &file_name, &data_url)
    })
    .await
}
#[tauri::command]
pub async fn reorder_gallery(
    state: tauri::State<'_, AppState>,
    id: String,
    before_id: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services
            .galleries
            .reorder_gallery(&id, before_id.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn list_gallery_items(
    state: tauri::State<'_, AppState>,
    gallery_id: String,
    offset: i64,
    limit: i64,
) -> Result<Page<GalleryItem>, CommandError> {
    run(state, move |services| {
        services.galleries.items(&gallery_id, offset, limit)
    })
    .await
}
#[tauri::command]
pub async fn import_gallery_path(
    state: tauri::State<'_, AppState>,
    gallery_id: String,
    path: String,
) -> Result<GalleryImportResult, CommandError> {
    run(state, move |services| {
        services.galleries.import_path(&gallery_id, &path)
    })
    .await
}
#[tauri::command]
pub async fn reorder_gallery_item(
    state: tauri::State<'_, AppState>,
    gallery_id: String,
    item_id: String,
    before_id: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |services| {
        services
            .galleries
            .reorder_item(&gallery_id, &item_id, before_id.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn delete_gallery(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<String, CommandError> {
    run(state, move |services| {
        services.galleries.delete_gallery(&id)
    })
    .await
}
#[tauri::command]
pub async fn delete_gallery_items(
    state: tauri::State<'_, AppState>,
    item_ids: Vec<String>,
) -> Result<String, CommandError> {
    run(state, move |services| {
        services.galleries.delete_items(&item_ids)
    })
    .await
}
#[tauri::command]
pub async fn undo_gallery_delete(
    state: tauri::State<'_, AppState>,
    token: String,
) -> Result<bool, CommandError> {
    run(state, move |services| {
        services.galleries.undo_delete(&token)
    })
    .await
}
#[tauri::command]
pub async fn transfer_gallery_items(
    state: tauri::State<'_, AppState>,
    item_ids: Vec<String>,
    target_gallery_id: String,
    move_items: bool,
) -> Result<GalleryTransferResult, CommandError> {
    run(state, move |services| {
        services
            .galleries
            .transfer(&item_ids, &target_gallery_id, move_items)
    })
    .await
}
#[tauri::command]
pub async fn get_gallery_asset_data(
    state: tauri::State<'_, AppState>,
    item_id: String,
) -> Result<GalleryAssetData, CommandError> {
    run(state, move |services| {
        services.galleries.asset_data(&item_id)
    })
    .await
}
