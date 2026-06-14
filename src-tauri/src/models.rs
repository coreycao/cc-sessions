use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

fn default_provider() -> String {
    "claude".to_string()
}

fn default_provider_label() -> String {
    "Claude Code".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    #[serde(default)]
    pub raw_session_id: String,
    #[serde(default = "default_provider")]
    pub provider: String,
    #[serde(default = "default_provider_label")]
    pub provider_label: String,
    pub project_path: String,
    pub project_name: String,
    pub full_path: String,
    pub title: String,
    pub first_prompt: String,
    pub message_count: usize,
    pub created: String,
    pub modified: String,
    pub git_branch: String,
    pub is_sidechain: bool,
    pub version: String,
    pub cwd: String,
    pub entrypoint: String,
    pub user_messages: Vec<String>,
    pub assistant_summary: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GtdMetadata {
    pub session_id: String,
    pub status: String,
    pub tags: Vec<String>,
    pub notes: String,
    pub starred: bool,
    pub updated_at: String,
    #[serde(default)]
    pub display_title: Option<String>,
    #[serde(default)]
    pub title_source: Option<String>,
    #[serde(default)]
    pub title_updated_at: Option<String>,
    #[serde(default)]
    pub title_fingerprint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppStore {
    pub gtd_data: HashMap<String, GtdMetadata>,
    pub tags: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SavedMessage {
    pub id: String,
    pub session_id: String,
    pub session_title: String,
    pub project_path: String,
    pub message_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
    pub saved_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct SavedMessagesStore {
    pub messages: Vec<SavedMessage>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AiProfile {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub active_profile_id: Option<String>,
    pub profiles: Vec<AiProfile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsageItem {
    pub id: String,
    pub label: String,
    pub path: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub app_data_path: String,
    pub total_bytes: u64,
    pub items: Vec<StorageUsageItem>,
}

#[derive(Deserialize)]
pub(crate) struct JsonlEntry {
    #[serde(rename = "type")]
    pub entry_type: Option<String>,
    pub message: Option<JsonlMessage>,
    pub timestamp: Option<String>,
    pub git_branch: Option<String>,
    pub version: Option<String>,
    pub cwd: Option<String>,
    pub entrypoint: Option<String>,
    pub session_id: Option<String>,
    pub is_sidechain: Option<bool>,
    pub ai_title: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ContentSearchResult {
    pub session_id: String,
    pub score: f64,
    pub matched_fields: Vec<String>,
    pub snippet: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionCacheEntry {
    pub session: SessionInfo,
    pub mtime_millis: u64,
    pub assistant_texts: Vec<String>,
    pub tool_inputs: Vec<String>,
}

impl SessionCacheEntry {
    pub fn from_session_and_mtime(
        session: SessionInfo,
        mtime: SystemTime,
        assistant_texts: Vec<String>,
        tool_inputs: Vec<String>,
    ) -> Self {
        Self {
            session,
            mtime_millis: mtime
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0),
            assistant_texts,
            tool_inputs,
        }
    }

    pub fn to_system_time(&self) -> SystemTime {
        UNIX_EPOCH + std::time::Duration::from_millis(self.mtime_millis)
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SessionCache {
    pub entries: HashMap<String, SessionCacheEntry>,
}

#[derive(Deserialize)]
pub(crate) struct JsonlMessage {
    pub role: Option<String>,
    pub content: Option<serde_json::Value>,
}
