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
