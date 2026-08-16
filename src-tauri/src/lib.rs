pub mod app_state;
pub mod application;
pub mod commands;
pub mod domain;
pub mod infrastructure;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let library_root = app.path().app_data_dir()?.join("library");
            app.manage(app_state::AppState::new(library_root));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::library::initialize_library,
            commands::library::update_library_settings,
            commands::notes::list_notes,
            commands::notes::get_note,
            commands::notes::create_note,
            commands::notes::save_note,
            commands::notes::list_recovery_candidates,
            commands::notes::resolve_recovery,
            commands::workspace::get_workspace_snapshot,
            commands::workspace::query_notes,
            commands::workspace::create_workspace_note,
            commands::workspace::get_workspace_note,
            commands::workspace::batch_notes,
            commands::workspace::empty_trash,
            commands::workspace::move_notes,
            commands::workspace::create_category,
            commands::workspace::rename_category,
            commands::workspace::update_category_appearance,
            commands::workspace::delete_category,
            commands::workspace::set_note_mood,
            commands::workspace::global_search,
            commands::workspace::save_attachment,
            commands::workspace::list_attachments,
            commands::workspace::delete_attachment,
            commands::workspace::reveal_attachment,
            commands::workspace::export_notes,
            commands::workspace::import_notes,
            commands::workspace::get_jotting_snapshot,
            commands::workspace::create_jotting_folder,
            commands::workspace::create_jotting,
            commands::workspace::update_jotting,
            commands::workspace::move_jotting,
            commands::workspace::delete_jotting,
            commands::workspace::delete_jotting_folder,
            commands::gallery::list_galleries,
            commands::gallery::create_gallery,
            commands::gallery::update_gallery,
            commands::gallery::reorder_gallery,
            commands::gallery::list_gallery_items,
            commands::gallery::import_gallery_path,
            commands::gallery::import_gallery_data,
            commands::gallery::reorder_gallery_item,
            commands::gallery::delete_gallery,
            commands::gallery::delete_gallery_items,
            commands::gallery::undo_gallery_delete,
            commands::gallery::transfer_gallery_items,
            commands::gallery::get_gallery_asset_data,
            commands::tasks::get_task_snapshot,
            commands::tasks::create_task_list,
            commands::tasks::update_task_list,
            commands::tasks::reorder_task_list,
            commands::tasks::create_task_item,
            commands::tasks::update_task_item,
            commands::tasks::set_task_completed,
            commands::tasks::reorder_task_item,
            commands::tasks::create_task_subtask,
            commands::tasks::update_task_subtask,
            commands::tasks::set_task_subtask_completed,
            commands::tasks::reorder_task_subtask,
            commands::tasks::delete_task_item,
            commands::tasks::delete_task_subtask,
            commands::tasks::delete_task_list,
            commands::tasks::undo_task_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
