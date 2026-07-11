// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

/// A reusable AI preset — a response Style or a Skill. Both are just a named
/// instruction (`body`) that augments the system prompt; `kind` distinguishes them.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PresetRow {
    pub id: String,
    /// "style" | "skill"
    pub kind: String,
    pub name: String,
    pub description: String,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[command]
pub fn list_presets(state: State<'_, DbState>, kind: String) -> Result<Vec<PresetRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_presets(&conn, &kind).map_err(|e| format!("Failed to list presets: {}", e))
}

#[command]
pub fn save_preset(state: State<'_, DbState>, preset: PresetRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_preset(&conn, &preset).map_err(|e| format!("Failed to save preset: {}", e))
}

#[command]
pub fn delete_preset(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_preset(&conn, &id).map_err(|e| format!("Failed to delete preset: {}", e))
}

// ─── Projects + knowledge ───────────────────────────────

/// A project: custom instructions + a knowledge base that grounds its chats.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub instructions: String,
    pub created_at: i64,
    pub updated_at: i64,
    /// Optional dashboard color (hex); null → UI derives one from the id.
    #[serde(default)]
    pub color: Option<String>,
}

/// One knowledge item attached to a project: a note or an uploaded file.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeRow {
    pub id: String,
    pub project_id: String,
    /// "note" | "file"
    pub kind: String,
    /// note id, or asset filename
    pub ref_id: String,
    pub label: String,
    pub created_at: i64,
}

#[command]
pub fn list_projects(state: State<'_, DbState>) -> Result<Vec<ProjectRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_projects(&conn).map_err(|e| format!("Failed to list projects: {}", e))
}

#[command]
pub fn save_project(state: State<'_, DbState>, project: ProjectRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::upsert_project(&conn, &project).map_err(|e| format!("Failed to save project: {}", e))
}

#[command]
pub fn delete_project(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_project(&conn, &id).map_err(|e| format!("Failed to delete project: {}", e))
}

#[command]
pub fn list_project_knowledge(state: State<'_, DbState>, project_id: String) -> Result<Vec<KnowledgeRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_project_knowledge(&conn, &project_id)
        .map_err(|e| format!("Failed to list project knowledge: {}", e))
}

#[command]
pub fn add_project_knowledge(state: State<'_, DbState>, item: KnowledgeRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::insert_project_knowledge(&conn, &item)
        .map_err(|e| format!("Failed to add project knowledge: {}", e))
}

#[command]
pub fn remove_project_knowledge(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_project_knowledge(&conn, &id)
        .map_err(|e| format!("Failed to remove project knowledge: {}", e))
}
