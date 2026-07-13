// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Vaults — the Obsidian-style top-level container (v14). Each note and folder
// belongs to exactly one vault; the file explorer shows one active vault's tree
// at a time. A default vault is always present (seeded in migrate_v14) and the
// app refuses to delete the last one, so there's never zero vaults. Deleting a
// vault reassigns its notes to another vault (never destroys them) and cascades
// its folders.

use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultRow {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[command]
pub fn list_vaults(state: State<'_, DbState>) -> Result<Vec<VaultRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_vaults(&conn).map_err(|e| format!("Failed to list vaults: {}", e))
}

/// Upsert a vault — create or rename/reposition.
#[command]
pub fn save_vault(state: State<'_, DbState>, vault: VaultRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_vault(&conn, &vault).map_err(|e| format!("Failed to save vault: {}", e))
}

/// Delete a vault, moving every note it holds into `reassign_to` (unfiled).
/// Refuses to delete the last vault so the app always has at least one.
#[command]
pub fn delete_vault(
    state: State<'_, DbState>,
    id: String,
    reassign_to: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    if queries::count_vaults(&conn).map_err(|e| format!("DB error: {}", e))? <= 1 {
        return Err("Can't delete your only vault.".to_string());
    }
    if reassign_to == id {
        return Err("Notes must be reassigned to a different vault.".to_string());
    }
    queries::delete_vault(&conn, &id, &reassign_to)
        .map_err(|e| format!("Failed to delete vault: {}", e))
}

/// Move a note into a vault directly (without a folder) — used when dragging a
/// note across vaults or when a note's vault must change independently of its
/// folder. Unfiles it so it doesn't dangle in a folder from the old vault.
#[command]
pub fn set_note_vault(
    state: State<'_, DbState>,
    note_id: String,
    vault_id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::set_note_folder(&conn, &note_id, None, &vault_id)
        .map_err(|e| format!("Failed to move note to vault: {}", e))
}
