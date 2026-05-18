use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};

use tauri::Manager;

use crate::models::{AppStore, SavedMessagesStore, SessionCache};
use crate::search_index::SearchIndex;

pub struct AppState {
    pub gtd_store: Mutex<AppStore>,
    pub cache: Mutex<SessionCache>,
    pub search_index: RwLock<SearchIndex>,
    pub saved_messages: Mutex<SavedMessagesStore>,
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

pub fn search_index_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("no app data dir")
        .join("search-index")
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{GtdMetadata, SessionCacheEntry, SessionInfo};
    use std::collections::HashMap;
    use std::time::{Duration, UNIX_EPOCH};

    fn unique_temp_path(file_name: &str) -> PathBuf {
        let unique = format!(
            "cc-sessions-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        );
        std::env::temp_dir().join(unique).join(file_name)
    }

    #[test]
    fn load_gtd_from_file_returns_empty_store_for_missing_or_invalid_files() {
        let missing_path = unique_temp_path("missing.json");
        assert!(load_gtd_from_file(&missing_path).gtd_data.is_empty());

        let invalid_path = unique_temp_path("invalid.json");
        fs::create_dir_all(invalid_path.parent().unwrap()).unwrap();
        fs::write(&invalid_path, "not json").unwrap();

        let store = load_gtd_from_file(&invalid_path);

        assert!(store.gtd_data.is_empty());
        assert!(store.tags.is_empty());

        let _ = fs::remove_dir_all(invalid_path.parent().unwrap());
    }

    #[test]
    fn save_and_load_gtd_store_round_trips_data() {
        let path = unique_temp_path("gtd-store.json");
        let mut gtd_data = HashMap::new();
        gtd_data.insert(
            "session-1".to_string(),
            GtdMetadata {
                session_id: "session-1".to_string(),
                status: "new".to_string(),
                tags: vec!["tests".to_string()],
                notes: "important".to_string(),
                starred: true,
                updated_at: "2026-05-18T00:00:00Z".to_string(),
            },
        );
        let store = AppStore {
            gtd_data,
            tags: vec!["tests".to_string()],
        };

        save_gtd_to_file(&path, &store).unwrap();
        let loaded = load_gtd_from_file(&path);

        assert_eq!(loaded.tags, vec!["tests".to_string()]);
        assert_eq!(loaded.gtd_data["session-1"].notes, "important");

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn save_and_load_session_cache_round_trips_entries() {
        let path = unique_temp_path("session-cache.json");
        let session = SessionInfo {
            session_id: "session-1".to_string(),
            project_path: "/tmp/project".to_string(),
            project_name: "project".to_string(),
            full_path: "/tmp/project/session.jsonl".to_string(),
            title: "Testing".to_string(),
            first_prompt: "Add tests".to_string(),
            message_count: 2,
            created: "2026-05-18T00:00:00Z".to_string(),
            modified: "2026-05-18T00:01:00Z".to_string(),
            git_branch: "main".to_string(),
            is_sidechain: false,
            version: "1".to_string(),
            cwd: "/tmp/project".to_string(),
            entrypoint: "cli".to_string(),
            user_messages: vec!["Add tests".to_string()],
            assistant_summary: "Done".to_string(),
        };
        let entry = SessionCacheEntry::from_session_and_mtime(
            session,
            UNIX_EPOCH + Duration::from_millis(1234),
            vec!["assistant".to_string()],
            vec!["tool".to_string()],
        );
        let cache = SessionCache {
            entries: HashMap::from([("session-1".to_string(), entry)]),
        };

        save_session_cache_to_file(&path, &cache).unwrap();
        let loaded = load_session_cache(&path);

        assert_eq!(loaded.entries["session-1"].mtime_millis, 1234);
        assert_eq!(
            loaded.entries["session-1"].assistant_texts,
            vec!["assistant".to_string()]
        );

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}
