use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::Deserialize;
use serde_json::json;
use tauri::Manager;

use crate::gtd::atomic_write;
use crate::models::{AiProfile, AiSettings};

const DEFAULT_TIMEOUT_SECS: u64 = 45;
const TEST_TIMEOUT_SECS: u64 = 20;

pub fn ai_settings_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("no app data dir")
        .join("ai-settings.json")
}

pub fn load_ai_settings_from_file(path: &Path) -> AiSettings {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AiSettings::default(),
    }
}

pub fn save_ai_settings_to_file(path: &Path, settings: &AiSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    atomic_write(path, json.as_bytes())
}

#[tauri::command]
pub fn load_ai_settings(app: tauri::AppHandle) -> AiSettings {
    load_ai_settings_from_file(&ai_settings_path(&app))
}

#[tauri::command]
pub fn save_ai_settings(app: tauri::AppHandle, settings: AiSettings) -> Result<AiSettings, String> {
    validate_settings(&settings)?;
    save_ai_settings_to_file(&ai_settings_path(&app), &settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn test_ai_connection(profile: AiProfile) -> Result<String, String> {
    validate_profile(&profile)?;
    let text = call_chat_completion_with_options(
        &profile,
        "You are testing an OpenAI-compatible API connection. Reply with exactly: OK",
        "Reply with exactly: OK",
        16,
        TEST_TIMEOUT_SECS,
        false,
    )
    .await?;

    Ok(if text.trim().is_empty() {
        "OK".to_string()
    } else {
        text
    })
}

#[tauri::command]
pub async fn summarize_session(
    app: tauri::AppHandle,
    profile_id: Option<String>,
    session_title: String,
    transcript: String,
) -> Result<String, String> {
    let settings = load_ai_settings_from_file(&ai_settings_path(&app));
    let profile = resolve_profile(&settings, profile_id.as_deref())?;
    validate_profile(profile)?;

    let user = format!(
        "Session title: {session_title}\n\nTranscript:\n{transcript}\n\nWrite the review now."
    );

    call_chat_completion(
        profile,
        "You are a careful engineering session reviewer. Summarize the current coding session in Markdown. Include: 1) the user's intent, 2) key decisions and code changes, 3) unresolved issues or risks, 4) suggested next actions. Be concise, concrete, and do not invent facts.",
        &user,
        900,
        DEFAULT_TIMEOUT_SECS,
    )
    .await
}

#[tauri::command]
pub async fn generate_session_title(
    app: tauri::AppHandle,
    profile_id: Option<String>,
    current_title: String,
    transcript: String,
) -> Result<String, String> {
    let settings = load_ai_settings_from_file(&ai_settings_path(&app));
    let profile = resolve_profile(&settings, profile_id.as_deref())?;
    validate_profile(profile)?;

    let user = format!(
        "Current title: {current_title}\n\nSession context:\n{transcript}\n\nImmediately return the new title only."
    );

    let title = call_chat_completion(
        profile,
        "You rename coding assistant sessions for a local session browser. Output one clear, specific display title only. Do not explain. Do not reason step by step. Requirements: 3 to 10 words when possible; preserve important project/domain terms; use the same language as the user's main request when obvious; no quotes; no Markdown; no trailing punctuation; do not mention Claude, Codex, AI, or session unless essential.",
        &user,
        1024,
        DEFAULT_TIMEOUT_SECS,
    )
    .await?;

    sanitize_generated_title(&title)
}

fn validate_settings(settings: &AiSettings) -> Result<(), String> {
    for profile in &settings.profiles {
        validate_profile(profile)?;
    }

    if let Some(active) = &settings.active_profile_id {
        if !settings.profiles.iter().any(|p| &p.id == active) {
            return Err("Active AI profile does not exist".to_string());
        }
    }

    Ok(())
}

fn validate_profile(profile: &AiProfile) -> Result<(), String> {
    if profile.id.trim().is_empty() {
        return Err("Profile id is required".to_string());
    }
    if profile.name.trim().is_empty() {
        return Err("Profile name is required".to_string());
    }
    if profile.base_url.trim().is_empty() {
        return Err("Base URL is required".to_string());
    }
    if profile.api_key.trim().is_empty() {
        return Err("API key is required".to_string());
    }
    if profile.model.trim().is_empty() {
        return Err("Model is required".to_string());
    }
    Ok(())
}

fn resolve_profile<'a>(
    settings: &'a AiSettings,
    requested_id: Option<&str>,
) -> Result<&'a AiProfile, String> {
    if settings.profiles.is_empty() {
        return Err("No AI API is configured. Add one in Settings > AI.".to_string());
    }

    let id = requested_id.or(settings.active_profile_id.as_deref());
    if let Some(id) = id {
        if let Some(profile) = settings.profiles.iter().find(|p| p.id == id) {
            return Ok(profile);
        }
    }

    settings
        .profiles
        .first()
        .ok_or_else(|| "No AI API is configured. Add one in Settings > AI.".to_string())
}

async fn call_chat_completion(
    profile: &AiProfile,
    system: &str,
    user: &str,
    max_tokens: u32,
    timeout_secs: u64,
) -> Result<String, String> {
    call_chat_completion_with_options(profile, system, user, max_tokens, timeout_secs, true).await
}

async fn call_chat_completion_with_options(
    profile: &AiProfile,
    system: &str,
    user: &str,
    max_tokens: u32,
    timeout_secs: u64,
    require_content: bool,
) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| e.to_string())?;

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    let token = format!("Bearer {}", profile.api_key.trim());
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&token).map_err(|_| "API key contains invalid header characters")?,
    );

    let url = chat_completions_url(&profile.base_url);
    let response = client
        .post(url)
        .headers(headers)
        .json(&json!({
            "model": profile.model.trim(),
            "messages": [
                { "role": "system", "content": system },
                { "role": "user", "content": user }
            ],
            "temperature": 0.2,
            "max_tokens": max_tokens
        }))
        .send()
        .await
        .map_err(|e| format!("AI request failed: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read AI response: {e}"))?;

    if !status.is_success() {
        return Err(format!("AI API returned {status}: {}", truncate(&body, 500)));
    }

    let parsed: ChatCompletionResponse =
        serde_json::from_str(&body).map_err(|e| format!("Invalid AI response: {e}"))?;
    let has_choice = !parsed.choices.is_empty();
    let finish_reasons = parsed
        .choices
        .iter()
        .filter_map(|choice| choice.finish_reason.as_deref())
        .collect::<Vec<_>>()
        .join(", ");
    let content = parsed
        .choices
        .into_iter()
        .filter_map(|choice| choice.into_text())
        .map(|content| content.trim().to_string())
        .find(|content| !content.is_empty());

    match (content, require_content, has_choice) {
        (Some(content), _, _) => Ok(content),
        (None, false, true) => Ok(String::new()),
        _ if !finish_reasons.is_empty() => Err(format!(
            "The AI response did not include message content. finish_reason: {finish_reasons}"
        )),
        _ => Err("The AI response did not include message content".to_string()),
    }
}

fn chat_completions_url(base_url: &str) -> String {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/chat/completions")
    }
}

fn truncate(value: &str, max: usize) -> String {
    let mut chars = value.chars();
    let truncated: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() {
        format!("{truncated}...")
    } else {
        value.to_string()
    }
}

fn sanitize_generated_title(value: &str) -> Result<String, String> {
    let mut title = value
        .trim()
        .trim_matches('"')
        .trim_matches('“')
        .trim_matches('”')
        .trim_matches('`')
        .trim()
        .to_string();

    if let Some(first_line) = title.lines().map(str::trim).find(|line| !line.is_empty()) {
        title = first_line.to_string();
    }

    title = title
        .trim_end_matches(['.', '。', ':', '：', ';', '；'])
        .trim()
        .to_string();

    if title.chars().count() > 80 {
        title = title.chars().take(80).collect::<String>().trim().to_string();
    }

    if title.is_empty() {
        Err("The AI response did not include a usable title".to_string())
    } else {
        Ok(title)
    }
}

#[derive(Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: Option<ChatMessage>,
    text: Option<String>,
    finish_reason: Option<String>,
}

impl ChatChoice {
    fn into_text(self) -> Option<String> {
        self.message
            .and_then(|message| message.content.and_then(|content| content.into_text()))
            .or(self.text)
    }
}

#[derive(Deserialize)]
struct ChatMessage {
    content: Option<ChatContent>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ChatContent {
    Text(String),
    Parts(Vec<ChatContentPart>),
}

impl ChatContent {
    fn into_text(self) -> Option<String> {
        match self {
            ChatContent::Text(text) => Some(text),
            ChatContent::Parts(parts) => {
                let text = parts
                    .into_iter()
                    .filter_map(|part| part.text)
                    .collect::<Vec<_>>()
                    .join("");
                Some(text)
            }
        }
    }
}

#[derive(Deserialize)]
struct ChatContentPart {
    text: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{chat_completions_url, ChatCompletionResponse};

    #[test]
    fn builds_chat_completions_url() {
        assert_eq!(
            chat_completions_url("https://api.openai.com/v1"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://example.test/v1/chat/completions"),
            "https://example.test/v1/chat/completions"
        );
    }

    #[test]
    fn parses_string_message_content() {
        let parsed: ChatCompletionResponse =
            serde_json::from_str(r#"{"choices":[{"message":{"content":"OK"}}]}"#).unwrap();
        let text = parsed
            .choices
            .into_iter()
            .find_map(|choice| choice.into_text());
        assert_eq!(text.as_deref(), Some("OK"));
    }

    #[test]
    fn parses_array_message_content() {
        let parsed: ChatCompletionResponse = serde_json::from_str(
            r#"{"choices":[{"message":{"content":[{"type":"text","text":"O"},{"type":"text","text":"K"}]}}]}"#,
        )
        .unwrap();
        let text = parsed
            .choices
            .into_iter()
            .find_map(|choice| choice.into_text());
        assert_eq!(text.as_deref(), Some("OK"));
    }

    #[test]
    fn parses_top_level_choice_text() {
        let parsed: ChatCompletionResponse =
            serde_json::from_str(r#"{"choices":[{"text":"OK"}]}"#).unwrap();
        let text = parsed.choices.into_iter().find_map(|choice| choice.into_text());
        assert_eq!(text.as_deref(), Some("OK"));
    }
}
