// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Per-note media layout — presentation metadata (width/alignment/caption) for
// media embeds, kept in its own table out of the note's markdown. Mirrors the
// themes.rs command structure: thin commands delegating to db::queries.

use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

/// One media item's layout within a note. `json` is opaque to Rust (e.g.
/// `{ width, alignment, caption }`) — the frontend owns its shape, same
/// treatment as canvas `data` and theme `json`.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MediaLayoutRow {
    pub media_key: String,
    pub json: String,
}

#[command]
pub fn get_media_layout(state: State<'_, DbState>, note_id: String) -> Result<Vec<MediaLayoutRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::get_media_layout(&conn, &note_id).map_err(|e| format!("Failed to load media layout: {}", e))
}

#[command]
pub fn set_media_layout(
    state: State<'_, DbState>,
    note_id: String,
    media_key: String,
    json: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::set_media_layout(&conn, &note_id, &media_key, &json)
        .map_err(|e| format!("Failed to save media layout: {}", e))
}
