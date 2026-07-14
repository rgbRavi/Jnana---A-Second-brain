// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use crate::db::{queries, DbState, assets_dir};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

pub struct NoteRow {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: String,
    pub created_at: i64,
    pub updated_at: i64,
    /// The virtual folder this note lives in, or `None` when unfiled (v13).
    /// Single-parent: a note is in exactly one folder. Changed only via
    /// `set_note_folder`, never a plain note save (see `insert_or_update_note`).
    pub folder_id: Option<String>,
    /// The vault this note belongs to (v14). Every note has exactly one; `None`
    /// only transiently if its vault was deleted (the app reassigns immediately).
    pub vault_id: Option<String>,
    /// Registered note-type id (v17); `None` = plain markdown (the default). Set on
    /// creation and never changed by a plain save (see `insert_or_update_note`).
    pub kind: Option<String>,
}

/// A note's reading progress (0..1) — drives the dashboard's "Continue learning".
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteProgressRow {
    pub note_id: String,
    pub progress: f64,
    pub updated_at: i64,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
    /// Virtual folder membership (v13); absent/`null` = unfiled. `#[serde(default)]`
    /// so callers that don't care about folders (most of the app) can omit it.
    #[serde(default)]
    pub folder_id: Option<String>,
    /// Vault membership (v14). `#[serde(default)]` so most callers can omit it;
    /// on a plain save it's preserved server-side (see `insert_or_update_note`).
    #[serde(default)]
    pub vault_id: Option<String>,
    /// Note-type id (v17); absent/`null` = plain markdown. `#[serde(default)]` so
    /// the vast majority of callers (which create/save plain notes) can omit it.
    #[serde(default)]
    pub kind: Option<String>,
}

impl Note {
    fn to_row(&self) -> NoteRow {
        NoteRow {
            id: self.id.clone(),
            title: self.title.clone(),
            content: self.content.clone(),
            tags: serde_json::to_string(&self.tags).unwrap_or("[]".into()),
            created_at: self.created_at,
            updated_at: self.updated_at,
            folder_id: self.folder_id.clone(),
            vault_id: self.vault_id.clone(),
            kind: self.kind.clone(),
        }
    }
    fn from_row(row: NoteRow) -> Self {
        Note {
            id: row.id,
            title: row.title,
            content: row.content,
            tags: serde_json::from_str(&row.tags).unwrap_or_default(),
            created_at: row.created_at,
            updated_at: row.updated_at,
            folder_id: row.folder_id,
            vault_id: row.vault_id,
            kind: row.kind,
        }
    }
}

// ─── Commands ───────────────────────────────────────────

#[command]
pub fn get_all_notes(state: State<'_, DbState>) -> Result<Vec<Note>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_all_notes(&conn)
        .map(|rows| rows.into_iter().map(Note::from_row).collect())
        .map_err(|e| format!("Failed to fetch notes: {}", e))
}

#[command]
pub fn get_note(state: State<'_, DbState>, id: String) -> Result<Note, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_note(&conn, &id)
        .map(Note::from_row)
        .map_err(|e| format!("Failed to fetch note {}: {}", id, e))
}

#[command]
pub fn save_note(state: State<'_, DbState>, note: Note) -> Result<Note, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_or_update_note(&conn, &note.to_row()).map_err(|e| {
        log::error!("save_note {} failed: {}", note.id, e);
        format!("Failed to save note: {}", e)
    })?;
    Ok(note)
}

#[command]
pub fn delete_note(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // 1. Collect all asset filenames before deleting the note.
    let asset_paths = queries::fetch_asset_paths_for_note(&conn, &id).unwrap_or_default();

    // 2. Also extract inline jnana-asset:// filenames from note content.
    let mut all_files: Vec<String> = asset_paths;
    if let Ok(row) = queries::fetch_note(&conn, &id) {
        // Parse ![...](jnana-asset://filename) from content
        for cap in row.content.match_indices("jnana-asset://") {
            let start = cap.0 + "jnana-asset://".len();
            if let Some(end) = row.content[start..].find(')') {
                let filename = &row.content[start..start + end];
                if !filename.is_empty() {
                    all_files.push(filename.to_string());
                }
            }
        }
    }

    // 3. Delete the note (CASCADE removes links, media_refs, annotations).
    queries::remove_note(&conn, &id).map_err(|e| {
        log::error!("delete_note {} failed: {}", id, e);
        format!("Failed to delete note {}: {}", id, e)
    })?;

    // 4. Clean up physical asset files from disk.
    let dir = assets_dir();
    for filename in all_files {
        let filepath = dir.join(&filename);
        if filepath.exists() {
            let _ = std::fs::remove_file(&filepath);
        }
    }

    Ok(())
}

// ─── Links ──────────────────────────────────────────────

#[command]
pub fn get_links(state: State<'_, DbState>, note_id: String) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_links_for_note(&conn, &note_id)
        .map_err(|e| format!("Failed to fetch links: {}", e))
}

#[command]
pub fn get_all_links(state: State<'_, DbState>) -> Result<Vec<(String, String)>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_all_links(&conn)
        .map_err(|e| format!("Failed to fetch all links: {}", e))
}

/// The link changes applied by `sync_links`, so the frontend can emit
/// `link:created` / `link:removed` events without re-deriving the diff.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncLinksResult {
    pub added: Vec<String>,
    pub removed: Vec<String>,
}

#[command]
pub fn sync_links(
    state: State<'_, DbState>,
    note_id: String,
    titles: Vec<String>,
) -> Result<SyncLinksResult, String> {
    let mut conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::sync_links_for_note(&mut conn, &note_id, &titles)
        .map(|(added, removed)| SyncLinksResult { added, removed })
        .map_err(|e| format!("Failed to sync links: {}", e))
}

#[command]
pub fn create_link(state: State<'_, DbState>, from_id: String, to_id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_link(&conn, &from_id, &to_id)
        .map_err(|e| format!("Failed to create link: {}", e))
}

#[command]
pub fn remove_link(state: State<'_, DbState>, from_id: String, to_id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::remove_link(&conn, &from_id, &to_id)
        .map_err(|e| format!("Failed to remove link: {}", e))
}

#[command]
pub fn add_favourite(state: State<'_, DbState>, note_id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::add_favourite(&conn, &note_id)
        .map_err(|e| format!("Failed to add favourite: {}", e))
}

#[command]
pub fn get_favourite_note_ids(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_favourite_note_ids(&conn)
        .map_err(|e| format!("Failed to fetch favourites: {}", e))
}

#[command]
pub fn remove_favourite(state: State<'_, DbState>, note_id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::remove_favourite(&conn, &note_id)
        .map_err(|e| format!("Failed to remove favourite: {}", e))
}

// ─── Reading progress ───────────────────────────────────

#[command]
pub fn set_note_progress(state: State<'_, DbState>, note_id: String, progress: f64) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::set_note_progress(&conn, &note_id, progress.clamp(0.0, 1.0), now_ms())
        .map_err(|e| format!("Failed to set note progress: {}", e))
}

#[command]
pub fn list_note_progress(state: State<'_, DbState>) -> Result<Vec<NoteProgressRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_note_progress(&conn)
        .map_err(|e| format!("Failed to list note progress: {}", e))
}