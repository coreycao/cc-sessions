use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

use crate::models::{AppStore, SessionCache};

pub struct AppState {
    pub gtd_store: Mutex<AppStore>,
    pub cache: Mutex<SessionCache>,
}

pub fn gtd_store_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("no app data dir")
        .join("gtd-store.json")
}

pub fn session_cache_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("no app data dir")
        .join("session-cache.json")
}

pub fn load_session_cache(path: &Path) -> SessionCache {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => SessionCache::default(),
    }
}

pub fn save_session_cache_to_file(path: &Path, cache: &SessionCache) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

pub fn load_gtd_from_file(path: &Path) -> AppStore {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(AppStore {
            gtd_data: std::collections::HashMap::new(),
            tags: vec![],
        }),
        Err(_) => AppStore {
            gtd_data: std::collections::HashMap::new(),
            tags: vec![],
        },
    }
}

pub fn save_gtd_to_file(path: &Path, store: &AppStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_gtd_store(state: tauri::State<'_, AppState>) -> AppStore {
    state.gtd_store.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_gtd_store(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    data: AppStore,
) -> Result<String, String> {
    save_gtd_to_file(&gtd_store_path(&app), &data)?;
    {
        let mut store = state.gtd_store.lock().unwrap();
        *store = data;
    }
    Ok("success".into())
}
