// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Virtual folders — one global tree that maps the whole app to a single
// Obsidian-style "vault". Folders are rows in SQLite, never real filesystem
// directories (that sidesteps case-sensitivity / illegal-char / MAX_PATH /
// reserved-name landmines across platforms). SINGLE-parent by design: a note
// lives in exactly one folder (or is unfiled) via `notes.folder_id`, which is
// what makes a folder feel like a folder. Folders are an additive *lens* — a
// note still appears in its workspaces, collections, graph, search, and
// favourites unchanged; deleting a folder never deletes notes.

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

/// One node of the virtual folder tree. `parent_id == None` is a top-level
/// folder. The frontend loads the whole flat list and builds the adjacency
/// list itself (the tree is tiny — no closure tables / nested sets).
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FolderRow {
    pub id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub position: i64,
    /// The vault this folder belongs to (v14). Every folder has exactly one.
    pub vault_id: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[command]
pub fn list_folders(state: State<'_, DbState>) -> Result<Vec<FolderRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_folders(&conn).map_err(|e| format!("Failed to list folders: {}", e))
}

/// Upsert a folder — create, rename, or reposition. Reparenting goes through
/// `move_folder` instead (it needs the cycle guard).
#[command]
pub fn save_folder(state: State<'_, DbState>, folder: FolderRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_folder(&conn, &folder).map_err(|e| format!("Failed to save folder: {}", e))
}

/// Delete a folder. Sub-folders cascade; the notes it held fall back to unfiled
/// (their `folder_id` is SET NULL by the FK) — notes are never destroyed here.
/// The "folder + notes" option in the UI deletes the notes separately first.
#[command]
pub fn delete_folder(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_folder(&conn, &id).map_err(|e| format!("Failed to delete folder: {}", e))
}

/// Reparent a folder (drag folder → folder). Rejects a move into itself or one
/// of its own descendants (which would orphan a cycle) with a friendly error.
#[command]
pub fn move_folder(
    state: State<'_, DbState>,
    id: String,
    parent_id: Option<String>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let ok = queries::move_folder(&conn, &id, parent_id.as_deref(), now_ms())
        .map_err(|e| format!("Failed to move folder: {}", e))?;
    if ok {
        Ok(())
    } else {
        Err("Can't move a folder into itself or one of its sub-folders.".to_string())
    }
}

/// Set or clear (`folder_id = None`) a note's single folder — drag note into a
/// folder, move between folders, or unfile. Also sets the note's vault (a note's
/// vault always matches its folder's; when unfiling, the caller passes the vault
/// to keep it in). Touches only `folder_id`/`vault_id`, so it never bumps
/// `updated_at` or fires the note-saved cascade.
#[command]
pub fn set_note_folder(
    state: State<'_, DbState>,
    note_id: String,
    folder_id: Option<String>,
    vault_id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::set_note_folder(&conn, &note_id, folder_id.as_deref(), &vault_id)
        .map_err(|e| format!("Failed to move note: {}", e))
}
