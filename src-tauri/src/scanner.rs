use std::fs;
use std::path::Path;

use tauri::Manager;

use crate::gtd::{session_cache_path, save_session_cache_to_file, AppState};
use crate::helpers::{extract_text, project_name_from_dir, projects_dir};
use crate::models::{ContentSearchResult, JsonlEntry, SessionCacheEntry, SessionInfo};

struct ParsedSession {
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

fn parse_session_file(file_path: &Path, project_dir_name: &str) -> Option<ParsedSession> {
    let content = fs::read_to_string(file_path).ok()?;
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
        let _ = save_session_cache_to_file(&session_cache_path(&app), &cache);
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
            idx.commit_and_reload().ok();
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
