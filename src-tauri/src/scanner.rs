use std::fs;
use std::path::Path;

use tauri::Manager;

use crate::gtd::{session_cache_path, save_session_cache_to_file, AppState};
use crate::helpers::{extract_text, project_name_from_dir, projects_dir};
use crate::models::{ContentSearchResult, JsonlEntry, SessionCacheEntry, SessionInfo};

pub(crate) struct ParsedSession {
    session: SessionInfo,
    assistant_texts: Vec<String>,
    tool_inputs: Vec<String>,
}

struct IndexChange {
    session_id: String,
    user_messages: Vec<String>,
    assistant_texts: Vec<String>,
    tool_inputs: Vec<String>,
}

pub(crate) fn parse_session_file(file_path: &Path, project_dir_name: &str) -> Option<ParsedSession> {
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!("Failed to read {}: {e}", file_path.display());
            return None;
        }
    };
    let lines: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.is_empty() {
        return None;
    }

    let mut session_id = String::new();
    let mut title = String::new();
    let mut first_prompt = String::new();
    let mut message_count: usize = 0;
    let mut created = String::new();
    let mut modified = String::new();
    let mut git_branch = String::new();
    let mut is_sidechain = false;
    let mut version = String::new();
    let mut cwd = String::new();
    let mut entrypoint = String::new();
    let mut user_messages: Vec<String> = Vec::new();
    let mut assistant_texts: Vec<String> = Vec::new();
    let mut tool_inputs: Vec<String> = Vec::new();

    for line in &lines {
        if let Ok(entry) = serde_json::from_str::<JsonlEntry>(line) {
            match entry.entry_type.as_deref() {
                Some("user") => {
                    message_count += 1;
                    if let Some(msg) = &entry.message {
                        if msg.role.as_deref() == Some("user") {
                            if let Some(c) = &msg.content {
                                let text = extract_text(c);
                                if !text.is_empty()
                                    && !text.starts_with("Generate a short, clear title")
                                {
                                    if user_messages.is_empty() {
                                        first_prompt = text.chars().take(200).collect();
                                    }
                                    user_messages.push(text.chars().take(500).collect());
                                }
                            }
                        }
                    }
                    if created.is_empty() {
                        created = entry.timestamp.clone().unwrap_or_default();
                    }
                    modified = entry.timestamp.clone().unwrap_or_default();
                    if let Some(v) = entry.git_branch {
                        git_branch = v;
                    }
                    if let Some(v) = entry.version {
                        version = v;
                    }
                    if let Some(v) = entry.cwd {
                        cwd = v;
                    }
                    if let Some(v) = entry.entrypoint {
                        entrypoint = v;
                    }
                    if let Some(v) = entry.session_id {
                        session_id = v;
                    }
                    if let Some(v) = entry.is_sidechain {
                        is_sidechain = v;
                    }
                }
                Some("assistant") => {
                    message_count += 1;
                    if let Some(v) = entry.session_id {
                        session_id = v;
                    }
                    if let Some(msg) = &entry.message {
                        if let Some(content) = &msg.content {
                            if let Some(blocks) = content.as_array() {
                                for block in blocks {
                                    let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                    if btype == "text" {
                                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                            if !text.is_empty() {
                                                assistant_texts.push(text.chars().take(1000).collect());
                                            }
                                        }
                                    } else if btype == "tool_use" {
                                        if let Some(input) = block.get("input") {
                                            let input_str = serde_json::to_string(input).unwrap_or_default();
                                            if !input_str.is_empty() {
                                                tool_inputs.push(input_str.chars().take(500).collect());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Some("ai-title") => {
                    title = entry.ai_title.unwrap_or_default();
                }
                Some("permission-mode") => {
                    if let Some(v) = entry.session_id {
                        session_id = v;
                    }
                }
                _ => {}
            }
        }
    }

    if created.is_empty() || modified.is_empty() {
        if let Ok(meta) = fs::metadata(file_path) {
            if created.is_empty() {
                if let Ok(ct) = meta.created() {
                    let dt: chrono::DateTime<chrono::Local> = ct.into();
                    created = dt.to_rfc3339();
                }
            }
            if modified.is_empty() {
                if let Ok(mt) = meta.modified() {
                    let dt: chrono::DateTime<chrono::Local> = mt.into();
                    modified = dt.to_rfc3339();
                }
            }
        }
    }

    if session_id.is_empty() {
        session_id = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
    }

    if title.is_empty() {
        title = if first_prompt.len() >= 60 {
            first_prompt.chars().take(60).collect()
        } else if !first_prompt.is_empty() {
            first_prompt.clone()
        } else {
            session_id.chars().take(8).collect()
        };
    }

    let inferred_project_path = project_name_from_dir(project_dir_name);
    let project_path = if cwd.is_empty() {
        inferred_project_path
    } else {
        cwd.clone()
    };

    Some(ParsedSession {
        session: SessionInfo {
            session_id,
            project_path: project_path.clone(),
            project_name: project_path,
            full_path: file_path.to_string_lossy().to_string(),
            title,
            first_prompt,
            message_count,
            created,
            modified,
            git_branch,
            is_sidechain,
            version,
            cwd,
            entrypoint,
            user_messages,
            assistant_summary: String::new(),
        },
        assistant_texts,
        tool_inputs,
    })
}

#[tauri::command]
pub fn scan_sessions(app: tauri::AppHandle, state: tauri::State<'_, AppState>) -> Vec<SessionInfo> {
    let pdir = projects_dir();
    if !pdir.exists() {
        return vec![];
    }

    let mut cache = state.cache.lock().unwrap();
    let mut dirty = false;
    let mut index_additions: Vec<IndexChange> = Vec::new();

    let mut sessions: Vec<SessionInfo> = Vec::new();
    let mut seen_keys: Vec<String> = Vec::new();

    let Ok(project_dirs) = fs::read_dir(&pdir) else {
        return sessions;
    };

    for entry in project_dirs.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if dir_name.starts_with('.') {
            continue;
        }

        let Ok(files) = fs::read_dir(&path) else {
            continue;
        };

        for file_entry in files.flatten() {
            let fp = file_entry.path();
            if fp.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                let key = fp.to_string_lossy().to_string();
                seen_keys.push(key.clone());

                let mtime = fs::metadata(&fp).ok().and_then(|m| m.modified().ok());

                let cached = cache.entries.get(&key);
                let use_cache = cached.is_some()
                    && mtime.is_some()
                    && cached.unwrap().to_system_time() == mtime.unwrap();

                if use_cache {
                    sessions.push(cached.unwrap().session.clone());
                } else if let Some(parsed) = parse_session_file(&fp, &dir_name) {
                    index_additions.push(IndexChange {
                        session_id: parsed.session.session_id.clone(),
                        user_messages: parsed.session.user_messages.clone(),
                        assistant_texts: parsed.assistant_texts.clone(),
                        tool_inputs: parsed.tool_inputs.clone(),
                    });
                    if let Some(mt) = mtime {
                        cache.entries.insert(
                            key.clone(),
                            SessionCacheEntry::from_session_and_mtime(
                                parsed.session.clone(),
                                mt,
                                parsed.assistant_texts,
                                parsed.tool_inputs,
                            ),
                        );
                        dirty = true;
                    }
                    sessions.push(parsed.session);
                }
            }
        }
    }

    // Evict deleted files from cache and collect session IDs for index removal
    let before = cache.entries.len();
    let evicted_ids: Vec<String> = cache
        .entries
        .iter()
        .filter(|(k, _)| !seen_keys.contains(k))
        .map(|(_, v)| v.session.session_id.clone())
        .collect();
    cache.entries.retain(|k, _| seen_keys.contains(k));
    if cache.entries.len() != before {
        dirty = true;
    }

    if dirty {
        if let Err(e) = save_session_cache_to_file(&session_cache_path(&app), &cache) {
            tracing::warn!("Failed to save session cache: {e}");
        }
    }

    // Apply incremental index updates
    if !index_additions.is_empty() || !evicted_ids.is_empty() {
        if let Ok(mut idx) = state.search_index.try_write() {
            for change in &index_additions {
                idx.index_session(
                    &change.session_id,
                    &change.user_messages,
                    &change.assistant_texts,
                    &change.tool_inputs,
                );
            }
            for id in &evicted_ids {
                idx.delete_session(id);
            }
            if let Err(e) = idx.commit_and_reload() {
                tracing::warn!("Incremental index commit failed: {e}");
            }
        }
    }

    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));
    sessions
}

#[tauri::command]
pub async fn search_session_content(query: String, app: tauri::AppHandle) -> Result<Vec<ContentSearchResult>, String> {
    let query_lower = query.trim().to_lowercase();
    if query_lower.len() < 2 {
        return Ok(vec![]);
    }

    tokio::task::spawn_blocking(move || {
        let state = app.state::<AppState>();
        let idx = state.search_index.read().map_err(|e| e.to_string())?;
        idx.search(&query_lower, 50)
    }).await.map_err(|e| format!("Search task failed: {}", e))?
}

#[tauri::command]
pub fn is_index_ready(state: tauri::State<'_, AppState>) -> bool {
    state.search_index.read().map(|idx| idx.session_count() > 0).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::path::PathBuf;

    fn write_jsonl(dir: &Path, name: &str, lines: &[&str]) -> PathBuf {
        let path = dir.join(name);
        let mut f = fs::File::create(&path).unwrap();
        for line in lines {
            writeln!(f, "{line}").unwrap();
        }
        path
    }

    fn temp_session_dir() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn parse_empty_file_returns_none() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "empty.jsonl", &[""]);
        assert!(parse_session_file(&path, "test-project").is_none());
    }

    #[test]
    fn parse_invalid_json_falls_back_to_file_metadata() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "bad.jsonl", &["not json at all", "also not json"]);
        // Invalid lines are skipped; parser falls back to file stem as session_id
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.session.session_id, "bad");
    }

    #[test]
    fn parse_minimal_user_entry() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "minimal.jsonl", &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-01-15T10:00:00Z","session_id":"s1","message":{"role":"user","content":"Hello"}}"#,
        ]);
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.session.session_id, "s1");
        assert_eq!(parsed.session.message_count, 1);
        assert_eq!(parsed.session.first_prompt, "Hello");
        assert_eq!(parsed.session.user_messages, vec!["Hello"]);
    }

    #[test]
    fn parse_skips_title_generation_prompts() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "title.jsonl", &[
            r#"{"type":"user","uuid":"u0","timestamp":"2026-01-15T10:00:00Z","session_id":"s1","message":{"role":"user","content":"Generate a short, clear title for this session"}}"#,
            r#"{"type":"user","uuid":"u1","timestamp":"2026-01-15T10:01:00Z","session_id":"s1","message":{"role":"user","content":"Real prompt"}}"#,
        ]);
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.session.first_prompt, "Real prompt");
        assert_eq!(parsed.session.user_messages.len(), 1);
    }

    #[test]
    fn parse_extracts_assistant_text_and_tool_inputs() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "assistant.jsonl", &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-01-15T10:00:00Z","session_id":"s1","message":{"role":"user","content":"read file"}}"#,
            r#"{"type":"assistant","uuid":"a1","timestamp":"2026-01-15T10:01:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Let me read that."},{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/tmp/test.rs"}}]}}"#,
        ]);
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.assistant_texts, vec!["Let me read that."]);
        assert_eq!(parsed.tool_inputs.len(), 1);
        assert!(parsed.tool_inputs[0].contains("test.rs"));
    }

    #[test]
    fn parse_uses_file_stem_as_fallback_session_id() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "abc123.jsonl", &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-01-15T10:00:00Z","message":{"role":"user","content":"Hi"}}"#,
        ]);
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.session.session_id, "abc123");
    }

    #[test]
    fn parse_extracts_git_branch_and_version() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "meta.jsonl", &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-01-15T10:00:00Z","session_id":"s1","git_branch":"feature/test","version":"4.0","cwd":"/home/user/project","message":{"role":"user","content":"hi"}}"#,
        ]);
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.session.git_branch, "feature/test");
        assert_eq!(parsed.session.version, "4.0");
        assert_eq!(parsed.session.cwd, "/home/user/project");
    }

    #[test]
    fn parse_ai_title_entry() {
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "title.jsonl", &[
            r#"{"type":"user","uuid":"u1","timestamp":"2026-01-15T10:00:00Z","session_id":"s1","message":{"role":"user","content":"hi"}}"#,
            r#"{"type":"ai-title","uuid":"t1","ai_title":"My Session Title"}"#,
        ]);
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.session.title, "My Session Title");
    }

    #[test]
    fn parse_truncates_long_user_messages() {
        let long_text = "x".repeat(600);
        let dir = temp_session_dir();
        let path = write_jsonl(dir.path(), "long.jsonl", &[
            format!(r#"{{"type":"user","uuid":"u1","timestamp":"2026-01-15T10:00:00Z","session_id":"s1","message":{{"role":"user","content":"{long_text}"}}}}"#).as_str(),
        ].into_iter().collect::<Vec<_>>());
        let parsed = parse_session_file(&path, "test-project").unwrap();
        assert_eq!(parsed.session.user_messages[0].len(), 500);
    }
}
