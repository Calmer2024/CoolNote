pub mod app_state;
pub mod application;
pub mod commands;
pub mod domain;
pub mod infrastructure;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
