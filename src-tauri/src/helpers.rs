use std::path::PathBuf;

pub fn home_dir() -> PathBuf {
    dirs::home_dir().expect("Cannot determine home directory")
}

pub fn projects_dir() -> PathBuf {
    home_dir().join(".claude").join("projects")
}

pub fn project_name_from_dir(dir_name: &str) -> String {
    let cleaned = dir_name.strip_prefix('-').unwrap_or(dir_name);
    if cleaned.is_empty() {
        return String::new();
    }

    infer_existing_path(cleaned).unwrap_or_else(|| format!("/{}", cleaned.replace('-', "/")))
}

fn infer_existing_path(encoded: &str) -> Option<String> {
    let parts: Vec<&str> = encoded.split('-').filter(|part| !part.is_empty()).collect();
    if parts.is_empty() {
        return None;
    }

    let mut path = PathBuf::from("/");
    let mut index = 0;

    while index < parts.len() {
        let mut matched = None;

        for end in ((index + 1)..=parts.len()).rev() {
            let candidate = parts[index..end].join("-");
            if path.join(&candidate).exists() {
                matched = Some((candidate, end));
                break;
            }
        }

        let (component, next_index) = matched?;
        path.push(component);
        index = next_index;
    }

    Some(path.to_string_lossy().to_string())
}

pub fn extract_snippet(text: &str, query: &str, window: usize) -> String {
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

pub fn extract_text(content: &serde_json::Value) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(arr) => arr
            .iter()
            .filter_map(|c| {
                if c.get("type").and_then(|t| t.as_str()) == Some("text") {
                    c.get("text").and_then(|t| t.as_str()).map(String::from)
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join(" "),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn project_name_from_dir_decodes_claude_project_directory_names() {
        assert_eq!(
            project_name_from_dir("-definitely-not-a-real-root-nested-project"),
            "/definitely/not/a/real/root/nested/project"
        );
        assert_eq!(project_name_from_dir("-"), "");
    }

    #[test]
    fn extract_snippet_returns_context_around_case_insensitive_match() {
        let snippet = extract_snippet("before searchable phrase after", "searchable", 12);

        assert!(snippet.starts_with("..."));
        assert!(snippet.contains("searchable"));
        assert!(snippet.ends_with("..."));
    }

    #[test]
    fn extract_snippet_falls_back_to_window_when_query_is_missing() {
        assert_eq!(extract_snippet("abcdef", "missing", 3), "abc");
    }

    #[test]
    fn extract_text_handles_strings_and_text_blocks() {
        assert_eq!(extract_text(&json!("plain text")), "plain text");
        assert_eq!(
            extract_text(&json!([
                { "type": "text", "text": "first" },
                { "type": "image", "source": "ignored" },
                { "type": "text", "text": "second" }
            ])),
            "first second"
        );
        assert_eq!(extract_text(&json!({ "type": "text" })), "");
    }

    #[test]
    fn extract_snippet_near_start_of_text() {
        let result = extract_snippet("match at beginning rest of text", "match", 10);
        assert!(result.contains("match"));
        assert!(!result.starts_with("..."));
    }

    #[test]
    fn extract_snippet_near_end_of_text() {
        let result = extract_snippet("long prefix text ending with match", "match", 10);
        assert!(result.contains("match"));
        assert!(!result.ends_with("..."));
    }

    #[test]
    fn extract_snippet_with_empty_text() {
        assert_eq!(extract_snippet("", "query", 10), "");
    }

    #[test]
    fn extract_snippet_window_larger_than_text() {
        assert_eq!(extract_snippet("abc", "abc", 100), "abc");
    }

    #[test]
    fn extract_text_with_empty_array() {
        assert_eq!(extract_text(&json!([])), "");
    }

    #[test]
    fn extract_text_with_text_blocks_missing_text_field() {
        assert_eq!(
            extract_text(&json!([{ "type": "text" }, { "type": "text", "text": "hello" }])),
            "hello"
        );
    }

    #[test]
    fn extract_text_with_number_and_null() {
        assert_eq!(extract_text(&json!(42)), "");
        assert_eq!(extract_text(&json!(null)), "");
    }

    #[test]
    fn project_name_from_dir_with_single_segment() {
        let result = project_name_from_dir("-Users-corey-myproject");
        // Falls back to path reconstruction since /Users may not exist in test env
        assert!(result.contains("myproject") || result.contains("Users"));
    }
}
