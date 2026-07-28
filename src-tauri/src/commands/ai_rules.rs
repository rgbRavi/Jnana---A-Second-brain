// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

/// A reusable "adaptive rule" — a named instruction the AI layer folds into a
/// project's system prompt. `critical` rules are always included; others are
/// selected as relevant.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RuleRow {
    pub id: String,
    pub vault_id: String,
    pub name: String,
    pub text: String,
    pub critical: bool,
    pub created_at: i64,
}

#[command]
pub fn list_rules(state: State<'_, DbState>, vault_id: String) -> Result<Vec<RuleRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_rules(&conn, &vault_id).map_err(|e| format!("Failed to list rules: {}", e))
}

#[command]
pub fn save_rule(state: State<'_, DbState>, rule: RuleRow) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::save_rule(&conn, &rule).map_err(|e| format!("Failed to save rule: {}", e))
}

#[command]
pub fn delete_rule(state: State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_rule(&conn, &id).map_err(|e| format!("Failed to delete rule: {}", e))
}

#[command]
pub fn list_project_rules(state: State<'_, DbState>, project_id: String) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::list_project_rules(&conn, &project_id)
        .map_err(|e| format!("Failed to list project rules: {}", e))
}

#[command]
pub fn set_project_rules(
    state: State<'_, DbState>,
    project_id: String,
    rule_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::set_project_rules(&conn, &project_id, &rule_ids)
        .map_err(|e| format!("Failed to set project rules: {}", e))
}
