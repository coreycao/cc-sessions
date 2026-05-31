use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::sync::{atomic::AtomicBool, Mutex, RwLock};

use serde::Deserialize;
use tauri::Manager;

use crate::models::{AppStore, GtdMetadata, SavedMessagesStore, SessionCache};
use crate::search_index::SearchIndex;

pub struct AppState {
    pub gtd_store: Mutex<AppStore>,
    pub cache: Mutex<SessionCache>,
    pub search_index: RwLock<SearchIndex>,
    pub index_ready: AtomicBool,
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
    atomic_write(path, json.as_bytes())
}

pub fn load_gtd_from_file(path: &Path) -> AppStore {
    let mut store = match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or(AppStore {
            gtd_data: std::collections::HashMap::new(),
            tags: vec![],
        }),
        Err(_) => AppStore {
            gtd_data: std::collections::HashMap::new(),
            tags: vec![],
        },
    };
    migrate_store(&mut store);
    store
}

pub fn save_gtd_to_file(path: &Path, store: &AppStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    atomic_write(path, json.as_bytes())
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("json")
    ));
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        e.to_string()
    })
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GtdUpdates {
    pub status: Option<String>,
    pub tags: Option<Vec<String>>,
    pub notes: Option<String>,
    pub starred: Option<bool>,
}

fn default_gtd(session_id: &str) -> GtdMetadata {
    GtdMetadata {
        session_id: session_id.to_string(),
        status: "new".to_string(),
        tags: vec![],
        notes: String::new(),
        starred: false,
        updated_at: String::new(),
    }
}

fn normalize_tag(tag: &str) -> Option<String> {
    let trimmed = tag.trim().to_lowercase();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn migrate_store(store: &mut AppStore) {
    for gtd in store.gtd_data.values_mut() {
        gtd.status = match gtd.status.as_str() {
            "inbox" | "todo" | "in-progress" | "waiting" => "new".to_string(),
            "done" => "archived".to_string(),
            _ => gtd.status.clone(),
        };
        gtd.tags = gtd.tags.iter().filter_map(|tag| normalize_tag(tag)).fold(
            Vec::new(),
            |mut acc, tag| {
                if !acc.contains(&tag) {
                    acc.push(tag);
                }
                acc
            },
        );
    }
    store.tags =
        store
            .tags
            .iter()
            .filter_map(|tag| normalize_tag(tag))
            .fold(Vec::new(), |mut acc, tag| {
                if !acc.contains(&tag) {
                    acc.push(tag);
                }
                acc
            });
}

fn apply_updates(mut current: GtdMetadata, updates: &GtdUpdates, now: &str) -> GtdMetadata {
    if let Some(status) = &updates.status {
        current.status = status.clone();
    }
    if let Some(tags) = &updates.tags {
        current.tags =
            tags.iter()
                .filter_map(|t| normalize_tag(t))
                .fold(Vec::new(), |mut acc, tag| {
                    if !acc.contains(&tag) {
                        acc.push(tag);
                    }
                    acc
                });
    }
    if let Some(notes) = &updates.notes {
        current.notes = notes.clone();
    }
    if let Some(starred) = updates.starred {
        current.starred = starred;
    }
    current.updated_at = now.to_string();
    current
}

fn save_locked_store(app: &tauri::AppHandle, store: &AppStore) -> Result<(), String> {
    save_gtd_to_file(&gtd_store_path(app), store)
}

#[tauri::command]
pub fn update_session_gtd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
    updates: GtdUpdates,
) -> Result<AppStore, String> {
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let current = store
        .gtd_data
        .get(&session_id)
        .cloned()
        .unwrap_or_else(|| default_gtd(&session_id));
    store
        .gtd_data
        .insert(session_id, apply_updates(current, &updates, &now));
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn add_session_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
    tag: String,
) -> Result<AppStore, String> {
    let Some(tag) = normalize_tag(&tag) else {
        return load_gtd_store_result(state);
    };
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut current = store
        .gtd_data
        .get(&session_id)
        .cloned()
        .unwrap_or_else(|| default_gtd(&session_id));
    if !current.tags.contains(&tag) {
        current.tags.push(tag.clone());
        current.updated_at = now;
        store.gtd_data.insert(session_id, current);
    }
    if !store.tags.contains(&tag) {
        store.tags.push(tag);
    }
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn remove_session_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_id: String,
    tag: String,
) -> Result<AppStore, String> {
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    if let Some(current) = store.gtd_data.get_mut(&session_id) {
        current.tags.retain(|t| t != &tag);
        current.updated_at = chrono::Utc::now().to_rfc3339();
    }
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn rename_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    old_tag: String,
    new_tag: String,
) -> Result<AppStore, String> {
    let Some(new_tag) = normalize_tag(&new_tag) else {
        return load_gtd_store_result(state);
    };
    if old_tag == new_tag {
        return load_gtd_store_result(state);
    }
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    for gtd in store.gtd_data.values_mut() {
        if gtd.tags.iter().any(|t| t == &old_tag) {
            let mut tags = Vec::new();
            for tag in &gtd.tags {
                let mapped = if tag == &old_tag { &new_tag } else { tag };
                if !tags.contains(mapped) {
                    tags.push(mapped.clone());
                }
            }
            gtd.tags = tags;
            gtd.updated_at = now.clone();
        }
    }
    let mut tags = Vec::new();
    for tag in &store.tags {
        let mapped = if tag == &old_tag { &new_tag } else { tag };
        if !tags.contains(mapped) {
            tags.push(mapped.clone());
        }
    }
    if !tags.contains(&new_tag) {
        tags.push(new_tag);
    }
    store.tags = tags;
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn delete_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    tag: String,
) -> Result<AppStore, String> {
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    for gtd in store.gtd_data.values_mut() {
        if gtd.tags.iter().any(|t| t == &tag) {
            gtd.tags.retain(|t| t != &tag);
            gtd.updated_at = now.clone();
        }
    }
    store.tags.retain(|t| t != &tag);
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn create_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    tag: String,
) -> Result<AppStore, String> {
    let Some(tag) = normalize_tag(&tag) else {
        return load_gtd_store_result(state);
    };
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    if !store.tags.contains(&tag) {
        store.tags.push(tag);
    }
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn batch_update_gtd(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_ids: Vec<String>,
    updates: GtdUpdates,
) -> Result<AppStore, String> {
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    for session_id in session_ids {
        let current = store
            .gtd_data
            .get(&session_id)
            .cloned()
            .unwrap_or_else(|| default_gtd(&session_id));
        store
            .gtd_data
            .insert(session_id, apply_updates(current, &updates, &now));
    }
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn batch_add_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_ids: Vec<String>,
    tag: String,
) -> Result<AppStore, String> {
    let Some(tag) = normalize_tag(&tag) else {
        return load_gtd_store_result(state);
    };
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    for session_id in session_ids {
        let mut current = store
            .gtd_data
            .get(&session_id)
            .cloned()
            .unwrap_or_else(|| default_gtd(&session_id));
        if !current.tags.contains(&tag) {
            current.tags.push(tag.clone());
            current.updated_at = now.clone();
            store.gtd_data.insert(session_id, current);
        }
    }
    if !store.tags.contains(&tag) {
        store.tags.push(tag);
    }
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

#[tauri::command]
pub fn batch_remove_tag(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    session_ids: Vec<String>,
    tag: String,
) -> Result<AppStore, String> {
    let mut store = state.gtd_store.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().to_rfc3339();
    for session_id in session_ids {
        if let Some(current) = store.gtd_data.get_mut(&session_id) {
            if current.tags.iter().any(|t| t == &tag) {
                current.tags.retain(|t| t != &tag);
                current.updated_at = now.clone();
            }
        }
    }
    save_locked_store(&app, &store)?;
    Ok(store.clone())
}

fn load_gtd_store_result(state: tauri::State<'_, AppState>) -> Result<AppStore, String> {
    state
        .gtd_store
        .lock()
        .map(|s| s.clone())
        .map_err(|e| e.to_string())
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
    fn load_gtd_from_file_migrates_legacy_statuses_and_tags() {
        let path = unique_temp_path("gtd-store.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(
            &path,
            r#"{"gtdData":{"s1":{"sessionId":"s1","status":"todo","tags":["Bug","bug"],"notes":"","starred":false,"updatedAt":""}},"tags":["Bug","bug"]}"#,
        )
        .unwrap();

        let loaded = load_gtd_from_file(&path);

        assert_eq!(loaded.gtd_data["s1"].status, "new");
        assert_eq!(loaded.gtd_data["s1"].tags, vec!["bug"]);
        assert_eq!(loaded.tags, vec!["bug"]);

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn save_and_load_session_cache_round_trips_entries() {
        let path = unique_temp_path("session-cache.json");
        let session = SessionInfo {
            session_id: "session-1".to_string(),
            raw_session_id: "session-1".to_string(),
            provider: "claude".to_string(),
            provider_label: "Claude Code".to_string(),
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
