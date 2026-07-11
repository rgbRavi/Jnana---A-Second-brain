// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Workspaces — named groups that organize notes without separate vaults. Notes
// stay global; membership is many-to-many. Collections are sub-groups inside a
// workspace. Mirrors the AI-projects command/query structure (ai_workspace.rs).

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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRow {
    pub id: String,
    pub name: String,
    pub icon: String,
    #[serde(default)]
    pub color: Option<String>,
    pub description: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRow {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub created_at: i64,
}

/// A note's membership in a workspace, carrying the per-workspace pin flag.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceNoteRow {
    pub note_id: String,
    pub pinned: bool,
}

/// Note count for a workspace (for the manager's badges).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCount {
    pub workspace_id: String,
    pub count: i64,
}

// ─── Workspaces ─────────────────────────────────────────

#[command]
pub fn list_workspaces(state: State<'_, DbState>) -> Result<Vec<WorkspaceRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_workspaces(&conn).map_err(|e| format!("Failed to list workspaces: {}", e))
}

#[command]
pub fn save_workspace(state: State<'_, DbState>, workspace: WorkspaceRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_workspace(&conn, &workspace).map_err(|e| format!("Failed to save workspace: {}", e))
}

#[command]
pub fn delete_workspace(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_workspace(&conn, &id).map_err(|e| format!("Failed to delete workspace: {}", e))
}

#[command]
pub fn list_workspace_counts(state: State<'_, DbState>) -> Result<Vec<WorkspaceCount>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::workspace_note_counts(&conn)
        .map(|rows| {
            rows.into_iter()
                .map(|(workspace_id, count)| WorkspaceCount { workspace_id, count })
                .collect()
        })
        .map_err(|e| format!("Failed to count workspace notes: {}", e))
}

// ─── Membership ─────────────────────────────────────────

#[command]
pub fn list_workspace_notes(
    state: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<WorkspaceNoteRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_workspace_notes(&conn, &workspace_id)
        .map_err(|e| format!("Failed to list workspace notes: {}", e))
}

#[command]
pub fn add_workspace_note(
    state: State<'_, DbState>,
    workspace_id: String,
    note_id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::add_workspace_note(&conn, &workspace_id, &note_id, now_ms())
        .map_err(|e| format!("Failed to add note to workspace: {}", e))
}

#[command]
pub fn add_workspace_notes(
    state: State<'_, DbState>,
    workspace_id: String,
    note_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let now = now_ms();
    for note_id in &note_ids {
        queries::add_workspace_note(&conn, &workspace_id, note_id, now)
            .map_err(|e| format!("Failed to add note to workspace: {}", e))?;
    }
    Ok(())
}

#[command]
pub fn remove_workspace_note(
    state: State<'_, DbState>,
    workspace_id: String,
    note_id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::remove_workspace_note(&conn, &workspace_id, &note_id)
        .map_err(|e| format!("Failed to remove note from workspace: {}", e))
}

#[command]
pub fn set_workspace_note_pinned(
    state: State<'_, DbState>,
    workspace_id: String,
    note_id: String,
    pinned: bool,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::set_workspace_note_pinned(&conn, &workspace_id, &note_id, pinned)
        .map_err(|e| format!("Failed to pin note: {}", e))
}

#[command]
pub fn list_note_workspace_ids(
    state: State<'_, DbState>,
    note_id: String,
) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_note_workspace_ids(&conn, &note_id)
        .map_err(|e| format!("Failed to list a note's workspaces: {}", e))
}

// ─── Collections ────────────────────────────────────────

#[command]
pub fn list_collections(
    state: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<CollectionRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_collections(&conn, &workspace_id)
        .map_err(|e| format!("Failed to list collections: {}", e))
}

#[command]
pub fn save_collection(state: State<'_, DbState>, collection: CollectionRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_collection(&conn, &collection)
        .map_err(|e| format!("Failed to save collection: {}", e))
}

#[command]
pub fn delete_collection(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_collection(&conn, &id).map_err(|e| format!("Failed to delete collection: {}", e))
}

#[command]
pub fn list_collection_note_ids(
    state: State<'_, DbState>,
    collection_id: String,
) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_collection_note_ids(&conn, &collection_id)
        .map_err(|e| format!("Failed to list collection notes: {}", e))
}

#[command]
pub fn add_collection_note(
    state: State<'_, DbState>,
    collection_id: String,
    note_id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::add_collection_note(&conn, &collection_id, &note_id, now_ms())
        .map_err(|e| format!("Failed to add note to collection: {}", e))
}

#[command]
pub fn remove_collection_note(
    state: State<'_, DbState>,
    collection_id: String,
    note_id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::remove_collection_note(&conn, &collection_id, &note_id)
        .map_err(|e| format!("Failed to remove note from collection: {}", e))
}
