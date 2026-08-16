use crate::app_state::AppState;
use crate::commands::notes::CommandError;
use crate::domain::task::{TaskItem, TaskList, TaskSnapshot, TaskSubtask};

async fn run<T: Send + 'static>(
    state: tauri::State<'_, AppState>,
    operation: impl FnOnce(crate::app_state::AppServices) -> Result<T, crate::domain::error::AppError>
        + Send
        + 'static,
) -> Result<T, CommandError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || operation(state.services()?))
        .await
        .map_err(|e| CommandError::join(e.to_string()))?
        .map_err(CommandError::from)
}

#[tauri::command]
pub async fn get_task_snapshot(
    state: tauri::State<'_, AppState>,
) -> Result<TaskSnapshot, CommandError> {
    run(state, |s| s.tasks.snapshot()).await
}
#[tauri::command]
pub async fn create_task_list(
    state: tauri::State<'_, AppState>,
    name: String,
    icon_name: String,
) -> Result<TaskList, CommandError> {
    run(state, move |s| s.tasks.create_list(&name, &icon_name)).await
}
#[tauri::command]
pub async fn update_task_list(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: i64,
    name: String,
    icon_name: String,
    notes: String,
) -> Result<TaskList, CommandError> {
    run(state, move |s| {
        s.tasks
            .update_list(&id, base_revision, &name, &icon_name, &notes)
    })
    .await
}
#[tauri::command]
pub async fn reorder_task_list(
    state: tauri::State<'_, AppState>,
    id: String,
    before_id: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |s| {
        s.tasks.reorder_list(&id, before_id.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn create_task_item(
    state: tauri::State<'_, AppState>,
    title: String,
    task_list_id: Option<String>,
) -> Result<TaskItem, CommandError> {
    run(state, move |s| {
        s.tasks.create_task(&title, task_list_id.as_deref())
    })
    .await
}
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn update_task_item(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: i64,
    title: String,
    notes: String,
    start_value: Option<String>,
    start_precision: Option<String>,
    due_value: Option<String>,
    due_precision: Option<String>,
    importance: String,
    task_list_id: Option<String>,
) -> Result<TaskItem, CommandError> {
    run(state, move |s| {
        s.tasks.update_task(
            &id,
            base_revision,
            &title,
            &notes,
            start_value.as_deref(),
            start_precision.as_deref(),
            due_value.as_deref(),
            due_precision.as_deref(),
            &importance,
            task_list_id.as_deref(),
        )
    })
    .await
}
#[tauri::command]
pub async fn set_task_completed(
    state: tauri::State<'_, AppState>,
    id: String,
    completed: bool,
) -> Result<TaskItem, CommandError> {
    run(state, move |s| s.tasks.set_task_completed(&id, completed)).await
}
#[tauri::command]
pub async fn reorder_task_item(
    state: tauri::State<'_, AppState>,
    id: String,
    before_id: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |s| {
        s.tasks.reorder_task(&id, before_id.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn create_task_subtask(
    state: tauri::State<'_, AppState>,
    task_id: String,
    title: String,
) -> Result<TaskSubtask, CommandError> {
    run(state, move |s| s.tasks.create_subtask(&task_id, &title)).await
}
#[tauri::command]
pub async fn update_task_subtask(
    state: tauri::State<'_, AppState>,
    id: String,
    base_revision: i64,
    title: String,
) -> Result<TaskSubtask, CommandError> {
    run(state, move |s| {
        s.tasks.update_subtask(&id, base_revision, &title)
    })
    .await
}
#[tauri::command]
pub async fn set_task_subtask_completed(
    state: tauri::State<'_, AppState>,
    id: String,
    completed: bool,
) -> Result<TaskSubtask, CommandError> {
    run(state, move |s| {
        s.tasks.set_subtask_completed(&id, completed)
    })
    .await
}
#[tauri::command]
pub async fn reorder_task_subtask(
    state: tauri::State<'_, AppState>,
    task_id: String,
    id: String,
    before_id: Option<String>,
) -> Result<(), CommandError> {
    run(state, move |s| {
        s.tasks.reorder_subtask(&task_id, &id, before_id.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn delete_task_item(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<String, CommandError> {
    run(state, move |s| s.tasks.delete_task(&id)).await
}
#[tauri::command]
pub async fn delete_task_subtask(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<String, CommandError> {
    run(state, move |s| s.tasks.delete_subtask(&id)).await
}
#[tauri::command]
pub async fn delete_task_list(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<String, CommandError> {
    run(state, move |s| s.tasks.delete_list(&id)).await
}
#[tauri::command]
pub async fn undo_task_delete(
    state: tauri::State<'_, AppState>,
    token: String,
) -> Result<bool, CommandError> {
    run(state, move |s| s.tasks.undo_delete(&token)).await
}
