use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

use crate::ai::ai_settings_path;
use crate::gtd::{gtd_store_path, search_index_dir, session_cache_path};
use crate::helpers::session_roots;
use crate::models::{StorageUsage, StorageUsageItem};
use crate::saved::saved_messages_path;

fn validate_session_path(file_path: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(file_path).map_err(|e| format!("Invalid path: {}", e))?;
    for allowed in session_roots() {
        let allowed_canonical = allowed.canonicalize().unwrap_or(allowed);
        if canonical.starts_with(&allowed_canonical) {
            return Ok(canonical);
        }
    }
    Err("Path escapes allowed session directories".to_string())
}

const MAX_SESSION_SIZE: u64 = 50 * 1024 * 1024; // 50 MB

#[tauri::command]
pub fn read_session_content(file_path: String) -> Result<String, String> {
    let path = validate_session_path(&file_path)?;
    let metadata = fs::metadata(&path)
        .map_err(|e| format!("Cannot read metadata for {}: {e}", path.display()))?;
    if metadata.len() > MAX_SESSION_SIZE {
        return Err(format!(
            "File too large ({} MB), maximum is 50 MB",
            metadata.len() / 1024 / 1024
        ));
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {e}", path.display()))
}

#[tauri::command]
pub fn delete_session(file_path: String) -> Result<String, String> {
    let path = validate_session_path(&file_path)?;
    fs::remove_file(&path).map_err(|e| format!("Failed to delete {}: {e}", path.display()))?;
    Ok("success".into())
}

fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[tauri::command]
pub fn restore_session(
    provider: String,
    cwd: String,
    session_id: String,
) -> Result<String, String> {
    let cwd_safe = escape_applescript(&cwd);
    let sid_safe = escape_applescript(&session_id);
    let command = match provider.as_str() {
        "codex" => format!(
            "cd \\\"{}\\\" && codex resume \\\"{}\\\"",
            cwd_safe, sid_safe
        ),
        _ => format!(
            "cd \\\"{}\\\" && claude --resume \\\"{}\\\"",
            cwd_safe, sid_safe
        ),
    };
    let script = format!(
        "tell application \"Terminal\"\n\tdo script \"{}\"\n\tactivate\nend tell",
        command
    );
    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok("success".into())
}

#[tauri::command]
pub async fn export_markdown(
    app: tauri::AppHandle,
    suggested_name: String,
    content: String,
) -> Result<Option<String>, String> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Markdown", &["md"])
        .set_file_name(&suggested_name)
        .blocking_save_file();

    let Some(path) = file_path else {
        return Ok(None);
    };

    let path_str = path.to_string();
    let pb = std::path::PathBuf::from(&path_str);
    fs::write(&pb, content).map_err(|e| e.to_string())?;
    Ok(Some(path_str))
}

#[tauri::command]
pub fn get_storage_usage(app: tauri::AppHandle) -> Result<StorageUsage, String> {
    let app_data_path = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?;

    let mut items = vec![
        storage_item("searchIndex", "Search index", search_index_dir(&app))?,
        storage_item("sessionCache", "Session cache", session_cache_path(&app))?,
        storage_item("gtdStore", "Tags, notes, and status", gtd_store_path(&app))?,
        storage_item("savedMessages", "Saved messages", saved_messages_path(&app))?,
        storage_item("aiSettings", "AI settings", ai_settings_path(&app))?,
    ];

    let total_bytes = dir_size(&app_data_path)?;
    let known_bytes: u64 = items.iter().map(|item| item.bytes).sum();
    let other_bytes = total_bytes.saturating_sub(known_bytes);
    if other_bytes > 0 {
        items.push(StorageUsageItem {
            id: "other".to_string(),
            label: "Other app data".to_string(),
            path: app_data_path.display().to_string(),
            bytes: other_bytes,
        });
    }

    Ok(StorageUsage {
        app_data_path: app_data_path.display().to_string(),
        total_bytes,
        items,
    })
}

fn storage_item(id: &str, label: &str, path: PathBuf) -> Result<StorageUsageItem, String> {
    Ok(StorageUsageItem {
        id: id.to_string(),
        label: label.to_string(),
        path: path.display().to_string(),
        bytes: path_size(&path)?,
    })
}

fn path_size(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    if path.is_dir() {
        return dir_size(path);
    }
    Ok(path
        .metadata()
        .map_err(|e| format!("Failed to read metadata for {}: {e}", path.display()))?
        .len())
}

fn dir_size(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }

    let mut total = 0;
    for entry in fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory {}: {e}", path.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let entry_path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata for {}: {e}", entry_path.display()))?;
        if metadata.is_dir() {
            total += dir_size(&entry_path)?;
        } else {
            total += metadata.len();
        }
    }
    Ok(total)
}
