use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

/// A stored AI-chat conversation. `messages` and `scope` are JSON strings the
/// frontend (de)serializes — the union of message shapes differs per mode, so
/// they live as opaque JSON blobs here.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRow {
    pub id: String,
    /// "focused" | "chat"
    pub mode: String,
    pub title: String,
    pub messages: String,
    pub scope: Option<String>,
    /// Owning project (AI Chat mode), or null.
    pub project_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Lightweight conversation summary for the history list (no message bodies).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMeta {
    pub id: String,
    pub mode: String,
    pub title: String,
    pub project_id: Option<String>,
    pub updated_at: i64,
}

#[command]
pub fn list_conversations(
    state: State<'_, DbState>,
    mode: Option<String>,
) -> Result<Vec<ConversationMeta>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_conversations(&conn, mode.as_deref())
        .map_err(|e| format!("Failed to list conversations: {}", e))
}

#[command]
pub fn get_conversation(state: State<'_, DbState>, id: String) -> Result<ConversationRow, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_conversation(&conn, &id)
        .map_err(|e| format!("Failed to fetch conversation: {}", e))
}

#[command]
pub fn save_conversation(state: State<'_, DbState>, conversation: ConversationRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_conversation(&conn, &conversation)
        .map_err(|e| format!("Failed to save conversation: {}", e))
}

#[command]
pub fn delete_conversation(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_conversation(&conn, &id)
        .map_err(|e| format!("Failed to delete conversation: {}", e))
}

#[command]
pub fn rename_conversation(
    state: State<'_, DbState>,
    id: String,
    title: String,
    updated_at: i64,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::rename_conversation(&conn, &id, &title, updated_at)
        .map_err(|e| format!("Failed to rename conversation: {}", e))
}
