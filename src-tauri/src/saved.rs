use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

use crate::gtd::AppState;
use crate::models::SavedMessagesStore;

pub fn saved_messages_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("no app data dir")
        .join("saved-messages.json")
}

pub fn load_saved_messages_from_file(path: &Path) -> SavedMessagesStore {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => SavedMessagesStore::default(),
    }
}

pub fn save_saved_messages_to_file(path: &Path, store: &SavedMessagesStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_saved_messages(state: tauri::State<'_, AppState>) -> SavedMessagesStore {
    state.saved_messages.lock().unwrap().clone()
}

#[tauri::command]
pub fn save_saved_messages(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    data: SavedMessagesStore,
) -> Result<String, String> {
    save_saved_messages_to_file(&saved_messages_path(&app), &data)?;
    {
        let mut store = state.saved_messages.lock().unwrap();
        *store = data;
    }
    Ok("success".into())
}
