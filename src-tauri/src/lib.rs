mod commands;
mod gtd;
mod helpers;
mod models;
mod scanner;

use notify::Watcher;
use tauri::{Emitter, Manager};

use gtd::{load_gtd_from_file, load_session_cache, gtd_store_path, session_cache_path, AppState};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let gtd_path = gtd_store_path(app.handle());
            let initial_store = load_gtd_from_file(&gtd_path);
            let cache_path = session_cache_path(app.handle());
            let initial_cache = load_session_cache(&cache_path);
            app.manage(AppState {
                gtd_store: std::sync::Mutex::new(initial_store),
                cache: std::sync::Mutex::new(initial_cache),
            });

            // Watch ~/.claude/projects/ for session file changes
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let (tx, rx) = std::sync::mpsc::channel();
                let mut watcher = match notify::recommended_watcher(tx) {
                    Ok(w) => w,
                    Err(e) => {
                        eprintln!("File watcher failed to start: {e}");
                        return;
                    }
                };

                let home = match dirs::home_dir() {
                    Some(h) => h,
                    None => return,
                };
                let watch_path = home.join(".claude/projects");

                if !watch_path.exists() {
                    return;
                }

                if let Err(e) = watcher.watch(&watch_path, notify::RecursiveMode::Recursive) {
                    eprintln!("Failed to watch sessions dir: {e}");
                    return;
                }

                let _watcher = watcher;
                let debounce = std::time::Duration::from_millis(500);

                while let Ok(res) = rx.recv() {
                    match res {
                        Ok(event) => {
                            let relevant = matches!(event.kind,
                                notify::EventKind::Create(_)
                                | notify::EventKind::Modify(_)
                                | notify::EventKind::Remove(_)
                            );
                            if !relevant { continue; }

                            let has_jsonl = event.paths.iter().any(|p| {
                                p.extension().and_then(|e| e.to_str()) == Some("jsonl")
                            });
                            if !has_jsonl { continue; }

                            std::thread::sleep(debounce);
                            while rx.try_recv().is_ok() {}
                            let _ = app_handle.emit("session-files-changed", ());
                        }
                        Err(e) => eprintln!("Watch error: {e:?}"),
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scanner::scan_sessions,
            scanner::search_session_content,
            gtd::load_gtd_store,
            gtd::save_gtd_store,
            commands::read_session_content,
            commands::delete_session,
            commands::restore_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
