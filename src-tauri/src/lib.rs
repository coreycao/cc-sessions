mod ai;
mod commands;
mod gtd;
mod helpers;
mod models;
mod saved;
mod scanner;
mod search_index;

use notify::Watcher;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

use crate::helpers::session_roots;
use gtd::{
    gtd_store_path, load_gtd_from_file, load_session_cache, search_index_dir, session_cache_path,
    AppState,
};
use saved::{load_saved_messages_from_file, saved_messages_path};

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();

    configure_system_proxy_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_menu_event(|app, event| match event.id().as_ref() {
            "app-settings" => {
                let _ = app.emit("app-menu-settings", ());
            }
            "app-check-updates" => {
                let _ = app.emit("app-menu-check-updates", ());
            }
            _ => {}
        })
        .setup(|app| {
            configure_app_menu(app)?;

            let gtd_path = gtd_store_path(app.handle());
            let initial_store = load_gtd_from_file(&gtd_path);
            let cache_path = session_cache_path(app.handle());
            let initial_cache = load_session_cache(&cache_path);

            let index_path = search_index_dir(app.handle());
            let search_idx = search_index::SearchIndex::open_or_create(&index_path)
                .expect("Failed to open search index — check filesystem permissions");

            let needs_build = search_idx.session_count() == 0;

            let saved_path = saved_messages_path(app.handle());
            let initial_saved = load_saved_messages_from_file(&saved_path);

            app.manage(AppState {
                gtd_store: std::sync::Mutex::new(initial_store),
                cache: std::sync::Mutex::new(initial_cache),
                search_index: std::sync::RwLock::new(search_idx),
                index_ready: AtomicBool::new(!needs_build),
                saved_messages: std::sync::Mutex::new(initial_saved),
            });

            // Background initial index build for first run
            if needs_build {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let state = handle.state::<AppState>();

                    // Snapshot cache entries
                    let entries: Vec<_> = {
                        let cache = state.cache.lock().unwrap();
                        cache.entries.values().cloned().collect()
                    };

                    // Batch index in groups of 20
                    for chunk in entries.chunks(20) {
                        let mut idx = state.search_index.write().unwrap();
                        for entry in chunk {
                            idx.index_session(
                                &entry.session.session_id,
                                &entry.session.user_messages,
                                &entry.assistant_texts,
                                &entry.tool_inputs,
                            );
                        }
                        if let Err(e) = idx.commit_and_reload() {
                            tracing::error!("Initial index commit failed: {e}");
                        }
                    }

                    state.index_ready.store(true, Ordering::SeqCst);
                    if let Err(e) = handle.emit("search-index-ready", ()) {
                        tracing::warn!("Failed to emit search-index-ready: {e}");
                    }
                });
            }

            // Watch known session roots for session file changes.
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let (tx, rx) = std::sync::mpsc::channel();
                let mut watcher = match notify::recommended_watcher(tx) {
                    Ok(w) => w,
                    Err(e) => {
                        tracing::warn!("File watcher failed to start: {e}");
                        return;
                    }
                };

                let mut watched = false;
                for watch_path in session_roots().into_iter().filter(|p| p.exists()) {
                    match watcher.watch(&watch_path, notify::RecursiveMode::Recursive) {
                        Ok(_) => watched = true,
                        Err(e) => tracing::warn!(
                            "Failed to watch sessions dir {}: {e}",
                            watch_path.display()
                        ),
                    }
                }

                if !watched {
                    return;
                }

                let _watcher = watcher;
                let debounce = std::time::Duration::from_millis(3000);

                while let Ok(res) = rx.recv() {
                    match res {
                        Ok(event) => {
                            let relevant = matches!(
                                event.kind,
                                notify::EventKind::Create(_)
                                    | notify::EventKind::Modify(_)
                                    | notify::EventKind::Remove(_)
                            );
                            if !relevant {
                                continue;
                            }

                            let has_jsonl = event
                                .paths
                                .iter()
                                .any(|p| p.extension().and_then(|e| e.to_str()) == Some("jsonl"));
                            if !has_jsonl {
                                continue;
                            }

                            std::thread::sleep(debounce);
                            while rx.try_recv().is_ok() {}
                            let _ = app_handle.emit("session-files-changed", ());
                        }
                        Err(e) => tracing::warn!("Watch error: {e:?}"),
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scanner::scan_sessions,
            scanner::search_session_content,
            scanner::is_index_ready,
            gtd::load_gtd_store,
            gtd::save_gtd_store,
            gtd::update_session_gtd,
            gtd::update_project_metadata,
            gtd::add_session_tag,
            gtd::remove_session_tag,
            gtd::rename_tag,
            gtd::delete_tag,
            gtd::create_tag,
            gtd::batch_update_gtd,
            gtd::batch_add_tag,
            gtd::batch_remove_tag,
            saved::load_saved_messages,
            saved::save_saved_messages,
            saved::add_saved_message,
            saved::remove_saved_message,
            commands::read_session_content,
            commands::delete_session,
            commands::restore_session,
            commands::export_markdown,
            commands::get_storage_usage,
            ai::load_ai_settings,
            ai::save_ai_settings,
            ai::test_ai_connection,
            ai::summarize_session,
            ai::generate_session_title,
            ai::generate_session_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn configure_app_menu(app: &mut tauri::App) -> tauri::Result<()> {
    let app_handle = app.handle();
    let settings = MenuItemBuilder::with_id("app-settings", "Settings")
        .accelerator("CmdOrCtrl+,")
        .build(app_handle)?;
    let check_updates =
        MenuItemBuilder::with_id("app-check-updates", "Check for Updates...").build(app_handle)?;

    let app_menu = SubmenuBuilder::new(app_handle, "CC Sessions")
        .about(Some(AboutMetadata {
            name: Some("CC Sessions".into()),
            copyright: Some("Released June 13, 2026".into()),
            ..Default::default()
        }))
        .separator()
        .item(&settings)
        .item(&check_updates)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit_with_text("Quit CC Sessions")
        .build()?;
    let file_menu = SubmenuBuilder::new(app_handle, "File")
        .close_window()
        .build()?;
    let edit_menu = SubmenuBuilder::new(app_handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(app_handle, "View")
        .fullscreen()
        .build()?;
    let window_menu = SubmenuBuilder::new(app_handle, "Window")
        .minimize()
        .fullscreen()
        .separator()
        .bring_all_to_front()
        .build()?;
    let help_menu = SubmenuBuilder::new(app_handle, "Help").build()?;
    let menu = MenuBuilder::new(app_handle)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .item(&window_menu)
        .item(&help_menu)
        .build()?;
    app.set_menu(menu).map(|_| ())
}

#[cfg(target_os = "macos")]
fn configure_system_proxy_env() {
    if std::env::var_os("HTTPS_PROXY").is_some() || std::env::var_os("https_proxy").is_some() {
        return;
    }

    let output = match std::process::Command::new("scutil").arg("--proxy").output() {
        Ok(output) if output.status.success() => output,
        Ok(output) => {
            tracing::warn!("scutil --proxy failed with status {}", output.status);
            return;
        }
        Err(error) => {
            tracing::warn!("Failed to read macOS proxy settings: {error}");
            return;
        }
    };

    let text = String::from_utf8_lossy(&output.stdout);
    if let Some(proxy) = parse_scutil_proxy(&text) {
        std::env::set_var("HTTPS_PROXY", &proxy);
        std::env::set_var("https_proxy", &proxy);
        std::env::set_var("HTTP_PROXY", &proxy);
        std::env::set_var("http_proxy", &proxy);
        tracing::info!("Configured updater proxy from macOS system settings");
    }
}

#[cfg(not(target_os = "macos"))]
fn configure_system_proxy_env() {}

#[cfg(target_os = "macos")]
fn parse_scutil_proxy(text: &str) -> Option<String> {
    let enabled = proxy_value(text, "HTTPSEnable").or_else(|| proxy_value(text, "HTTPEnable"))?;
    if enabled != "1" {
        return None;
    }

    let host = proxy_value(text, "HTTPSProxy").or_else(|| proxy_value(text, "HTTPProxy"))?;
    let port = proxy_value(text, "HTTPSPort").or_else(|| proxy_value(text, "HTTPPort"))?;
    Some(format!("http://{host}:{port}"))
}

#[cfg(target_os = "macos")]
fn proxy_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        (name.trim() == key).then(|| value.trim().to_string())
    })
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::parse_scutil_proxy;

    #[test]
    fn parses_macos_https_proxy() {
        let proxy = parse_scutil_proxy(
            r#"<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 7890
  HTTPSProxy : 127.0.0.1
}"#,
        );

        assert_eq!(proxy.as_deref(), Some("http://127.0.0.1:7890"));
    }
}
