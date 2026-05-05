use std::path::PathBuf;

pub fn home_dir() -> PathBuf {
    dirs::home_dir().expect("Cannot determine home directory")
}

pub fn projects_dir() -> PathBuf {
    home_dir().join(".claude").join("projects")
}

pub fn project_name_from_dir(dir_name: &str) -> String {
    let cleaned = dir_name.strip_prefix('-').unwrap_or(dir_name);
    let full = cleaned.replace('-', "/");
    let home_str = home_dir().to_string_lossy().to_string();
    if full.starts_with(&home_str) {
        full.replace(&home_str, "~")
    } else {
        full
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
