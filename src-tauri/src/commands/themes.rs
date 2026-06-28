// Theme Studio persistence — built-in presets, user-saved custom themes, and
// the currently-active theme. Mirrors the workspaces/ai_workspace command
// structure: thin commands delegating to db::queries.

use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A built-in preset or user-saved custom theme. `json` is the opaque theme
/// object (tokens/fonts/density/...) — Rust never parses it, the same
/// treatment given to canvas `data` and conversation `messages`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ThemeRow {
    pub id: String,
    pub name: String,
    pub json: String,
    pub is_builtin: bool,
    pub created_at: i64,
}

#[command]
pub fn list_themes(state: State<'_, DbState>) -> Result<Vec<ThemeRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_themes(&conn).map_err(|e| format!("Failed to list themes: {}", e))
}

#[command]
pub fn save_theme(state: State<'_, DbState>, theme: ThemeRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_theme(&conn, &theme).map_err(|e| format!("Failed to save theme: {}", e))
}

#[command]
pub fn delete_theme(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_theme(&conn, &id).map_err(|e| format!("Failed to delete theme: {}", e))
}

#[command]
pub fn get_active_theme(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::get_active_theme(&conn).map_err(|e| format!("Failed to load active theme: {}", e))
}

#[command]
pub fn set_active_theme(state: State<'_, DbState>, json: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::set_active_theme(&conn, &json, now_ms())
        .map_err(|e| format!("Failed to save active theme: {}", e))
}
