use std::fs;
use std::path::PathBuf;
use std::process::Command;

use crate::helpers::projects_dir;

fn validate_session_path(file_path: &str) -> Result<PathBuf, String> {
    let canonical = fs::canonicalize(file_path).map_err(|e| format!("Invalid path: {}", e))?;
    let allowed = projects_dir();
    let allowed_canonical = allowed.canonicalize().unwrap_or_else(|_| allowed);
    if !canonical.starts_with(&allowed_canonical) {
        return Err("Path escapes allowed directory".to_string());
    }
    Ok(canonical)
}

const MAX_SESSION_SIZE: u64 = 50 * 1024 * 1024; // 50 MB

#[tauri::command]
pub fn read_session_content(file_path: String) -> Result<String, String> {
    let path = validate_session_path(&file_path)?;
    let metadata = fs::metadata(&path).map_err(|e| format!("Cannot read file metadata: {}", e))?;
    if metadata.len() > MAX_SESSION_SIZE {
        return Err(format!("File too large ({} MB), maximum is 50 MB", metadata.len() / 1024 / 1024));
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_session(file_path: String) -> Result<String, String> {
    let path = validate_session_path(&file_path)?;
    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok("success".into())
}

fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
}

#[tauri::command]
pub fn restore_session(cwd: String, session_id: String) -> Result<String, String> {
    let cwd_safe = escape_applescript(&cwd);
    let sid_safe = escape_applescript(&session_id);
    let script = format!(
        "tell application \"Terminal\"\n\tdo script \"cd \\\"{}\\\" && claude --resume \\\"{}\\\"\"\n\tactivate\nend tell",
        cwd_safe, sid_safe
    );
    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok("success".into())
}
