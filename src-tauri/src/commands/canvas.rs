// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Workspace canvases — a freeform spatial board per workspace. The whole board
// (nodes / edges / freehand drawings) is stored as one JSON document in `data`
// (JSON-Canvas-compatible shape + Jnana extensions). Mirrors the workspaces
// command/query structure (workspaces.rs).

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

const EMPTY_CANVAS: &str = "{\"nodes\":[],\"edges\":[],\"drawings\":[]}";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CanvasRow {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    /// JSON document of the board (nodes / edges / drawings).
    pub data: String,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The workspace's first canvas, creating an empty one on first open.
#[command]
pub fn get_or_create_workspace_canvas(
    state: State<'_, DbState>,
    workspace_id: String,
) -> Result<CanvasRow, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut rows =
        queries::list_canvases(&conn, &workspace_id).map_err(|e| format!("Failed to load canvas: {}", e))?;
    if let Some(first) = rows.drain(..).next() {
        return Ok(first);
    }
    let now = now_ms();
    let row = CanvasRow {
        id: uuid::Uuid::new_v4().to_string(),
        workspace_id,
        title: "Canvas".to_string(),
        data: EMPTY_CANVAS.to_string(),
        created_at: now,
        updated_at: now,
    };
    queries::upsert_canvas(&conn, &row).map_err(|e| format!("Failed to create canvas: {}", e))?;
    Ok(row)
}

#[command]
pub fn list_canvases(
    state: State<'_, DbState>,
    workspace_id: String,
) -> Result<Vec<CanvasRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_canvases(&conn, &workspace_id).map_err(|e| format!("Failed to list canvases: {}", e))
}

#[command]
pub fn get_canvas(state: State<'_, DbState>, id: String) -> Result<Option<CanvasRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::get_canvas(&conn, &id).map_err(|e| format!("Failed to load canvas: {}", e))
}

#[command]
pub fn save_canvas(state: State<'_, DbState>, canvas: CanvasRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_canvas(&conn, &canvas).map_err(|e| format!("Failed to save canvas: {}", e))
}

#[command]
pub fn rename_canvas(state: State<'_, DbState>, id: String, title: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::rename_canvas(&conn, &id, &title, now_ms())
        .map_err(|e| format!("Failed to rename canvas: {}", e))
}

#[command]
pub fn delete_canvas(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_canvas(&conn, &id).map_err(|e| format!("Failed to delete canvas: {}", e))
}
