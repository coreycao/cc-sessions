mod commands;
mod gtd;
mod helpers;
mod models;
mod scanner;

use tauri::Manager;

use gtd::{load_gtd_from_file, gtd_store_path, AppState};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let gtd_path = gtd_store_path(app.handle());
            let initial_store = load_gtd_from_file(&gtd_path);
            app.manage(AppState {
                gtd_store: std::sync::Mutex::new(initial_store),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scanner::scan_sessions,
            gtd::load_gtd_store,
            gtd::save_gtd_store,
            commands::read_session_content,
            commands::delete_session,
            commands::restore_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
