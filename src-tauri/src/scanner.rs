use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use std::time::SystemTime;

use crate::helpers::{extract_text, project_name_from_dir, projects_dir};
use crate::models::{ContentSearchResult, JsonlEntry, SessionInfo};

struct CacheEntry {
    session: SessionInfo,
    modified: SystemTime,
}

static CACHE: Mutex<Option<HashMap<String, CacheEntry>>> = Mutex::new(None);

fn parse_session_file(file_path: &Path, project_dir_name: &str) -> Option<SessionInfo> {
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

    Some(SessionInfo {
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
    })
}

#[tauri::command]
pub fn scan_sessions() -> Vec<SessionInfo> {
    let pdir = projects_dir();
    if !pdir.exists() {
        return vec![];
    }

    let mut cache = CACHE.lock().unwrap();
    if cache.is_none() {
        *cache = Some(HashMap::new());
    }
    let cache = cache.as_mut().unwrap();

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

                let cached = cache.get(&key);
                let use_cache = cached.is_some()
                    && mtime.is_some()
                    && cached.unwrap().modified == mtime.unwrap();

                if use_cache {
                    sessions.push(cached.unwrap().session.clone());
                } else if let Some(session) = parse_session_file(&fp, &dir_name) {
                    if let Some(mt) = mtime {
                        cache.insert(
                            key.clone(),
                            CacheEntry {
                                session: session.clone(),
                                modified: mt,
                            },
                        );
                    }
                    sessions.push(session);
                }
            }
        }
    }

    // Evict deleted files from cache
    cache.retain(|k, _| seen_keys.contains(k));

    sessions.sort_by(|a, b| b.modified.cmp(&a.modified));
    sessions
}

fn count_occurrences(haystack: &str, needle: &str) -> usize {
    haystack.to_lowercase().matches(needle).count()
}

fn extract_snippet(text: &str, query: &str, window: usize) -> String {
    let lower = text.to_lowercase();
    if let Some(pos) = lower.find(query) {
        let start = pos.saturating_sub(window / 2);
        let end = (pos + query.len() + window / 2).min(text.len());
        let mut snippet = String::new();
        if start > 0 { snippet.push_str("..."); }
        snippet.push_str(&text[start..end]);
        if end < text.len() { snippet.push_str("..."); }
        snippet
    } else {
        text.chars().take(window).collect()
    }
}

#[tauri::command]
pub async fn search_session_content(query: String) -> Vec<ContentSearchResult> {
    tokio::task::spawn_blocking(move || {
        let query_lower = query.to_lowercase();
        if query_lower.len() < 2 {
            return vec![];
        }

        // Snapshot cache data, then release lock
        let cached_entries: Vec<(String, Vec<String>, String)> = {
            let cache = CACHE.lock().unwrap();
            match cache.as_ref() {
                Some(map) => map
                    .values()
                    .map(|e| {
                        (
                            e.session.session_id.clone(),
                            e.session.user_messages.clone(),
                            e.session.full_path.clone(),
                        )
                    })
                    .collect(),
                None => return vec![],
            }
        };

        let mut results: Vec<ContentSearchResult> = Vec::new();

        for (session_id, user_messages, full_path) in &cached_entries {
            let mut score: f64 = 0.0;
            let mut matched_fields: Vec<String> = Vec::new();
            let mut best_snippet: Option<String> = None;

            // Tier 1: search cached user_messages (no disk I/O)
            for msg in user_messages {
                let count = count_occurrences(msg, &query_lower);
                if count > 0 {
                    score += count as f64 * 3.0;
                    if !matched_fields.contains(&"user_messages".to_string()) {
                        matched_fields.push("user_messages".to_string());
                    }
                    if best_snippet.is_none() {
                        best_snippet = Some(extract_snippet(msg, &query_lower, 120));
                    }
                }
            }

            // Tier 2: read JSONL for assistant text and tool content
            if let Ok(content) = fs::read_to_string(full_path) {
                for line in content.lines() {
                    if !line.to_lowercase().contains(&query_lower) {
                        continue;
                    }
                    if let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) {
                        let entry_type = entry.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        if entry_type == "assistant" {
                            if let Some(blocks) = entry
                                .get("message")
                                .and_then(|m| m.get("content"))
                                .and_then(|c| c.as_array())
                            {
                                for block in blocks {
                                    let btype = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                    if btype == "text" {
                                        if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                                            let count = count_occurrences(text, &query_lower);
                                            if count > 0 {
                                                score += count as f64 * 1.0;
                                                if !matched_fields.contains(&"assistant_text".to_string()) {
                                                    matched_fields.push("assistant_text".to_string());
                                                }
                                                if best_snippet.is_none() {
                                                    best_snippet = Some(extract_snippet(text, &query_lower, 120));
                                                }
                                            }
                                        }
                                    } else if btype == "tool_use" {
                                        let input_str = serde_json::to_string(&block.get("input"))
                                            .unwrap_or_default();
                                        let count = count_occurrences(&input_str, &query_lower);
                                        if count > 0 {
                                            score += count as f64 * 0.5;
                                            if !matched_fields.contains(&"tool_content".to_string()) {
                                                matched_fields.push("tool_content".to_string());
                                            }
                                            if best_snippet.is_none() {
                                                best_snippet = Some(extract_snippet(&input_str, &query_lower, 120));
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if score > 0.0 {
                results.push(ContentSearchResult {
                    session_id: session_id.clone(),
                    score,
                    matched_fields,
                    snippet: best_snippet.unwrap_or_default(),
                });
            }
        }

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(50);
        results
    }).await.unwrap_or_default()
}
