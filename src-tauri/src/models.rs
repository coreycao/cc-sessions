use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
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
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AppStore {
    pub gtd_data: HashMap<String, GtdMetadata>,
    pub tags: Vec<String>,
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

#[derive(Deserialize)]
pub(crate) struct JsonlMessage {
    pub role: Option<String>,
    pub content: Option<serde_json::Value>,
}
