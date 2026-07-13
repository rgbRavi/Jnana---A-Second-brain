// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Plugin storage (v17) — a per-plugin opaque-JSON key/value store, so a plugin can
// persist side-state beyond a note's content (e.g. a flashcard deck's SM-2 review
// schedule). Thin commands delegating to db::queries; `value` is never parsed by
// Rust, the same treatment given to canvas `data` and theme blobs. Scoped by
// `plugin_id` so plugins can't read each other's keys.

use crate::db::{queries, DbState};
use std::fs;
use std::path::Path;
use tauri::{command, State};

#[command]
pub fn plugin_kv_get(
    state: State<'_, DbState>,
    plugin_id: String,
    key: String,
) -> Result<Option<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::plugin_kv_get(&conn, &plugin_id, &key)
        .map_err(|e| format!("Failed to read plugin storage: {}", e))
}

#[command]
pub fn plugin_kv_set(
    state: State<'_, DbState>,
    plugin_id: String,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::plugin_kv_set(&conn, &plugin_id, &key, &value)
        .map_err(|e| format!("Failed to write plugin storage: {}", e))
}

#[command]
pub fn plugin_kv_delete(
    state: State<'_, DbState>,
    plugin_id: String,
    key: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::plugin_kv_delete(&conn, &plugin_id, &key)
        .map_err(|e| format!("Failed to delete plugin storage key: {}", e))
}

#[command]
pub fn plugin_kv_list(
    state: State<'_, DbState>,
    plugin_id: String,
) -> Result<Vec<(String, String)>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::plugin_kv_list(&conn, &plugin_id)
        .map_err(|e| format!("Failed to list plugin storage: {}", e))
}

#[command]
pub fn plugin_kv_clear(state: State<'_, DbState>, plugin_id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::plugin_kv_clear(&conn, &plugin_id)
        .map_err(|e| format!("Failed to clear plugin storage: {}", e))
}

// ─── Developer tools ────────────────────────────────────

/// Scaffold a new plugin project into `dir/<id>/` — a manifest, an entry module,
/// and a README. Forward-looking (the dynamic loader that consumes these arrives
/// in a later phase), but gives developers a correct starting point today. Fails
/// if the target folder already exists, so it never clobbers work.
#[command]
pub fn scaffold_plugin(dir: String, id: String, name: String) -> Result<String, String> {
    let safe_id = id.trim();
    if safe_id.is_empty()
        || !safe_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err("Plugin id must be non-empty and use only letters, digits, - _ .".into());
    }

    let root = Path::new(&dir).join(safe_id);
    if root.exists() {
        return Err(format!("A folder named '{}' already exists here.", safe_id));
    }
    fs::create_dir_all(root.join("src"))
        .map_err(|e| format!("Failed to create plugin folder: {}", e))?;

    let display_name = if name.trim().is_empty() { safe_id } else { name.trim() };

    let manifest = format!(
        "{{\n  \"id\": \"{id}\",\n  \"name\": \"{name}\",\n  \"version\": \"0.1.0\",\n  \"description\": \"\",\n  \"author\": \"\",\n  \"main\": \"dist/main.js\",\n  \"minAppVersion\": \"0.1.0\",\n  \"contributes\": {{ \"noteTypes\": [] }},\n  \"permissions\": []\n}}\n",
        id = safe_id,
        name = display_name,
    );

    let index = format!(
        "// {name} — a Jnana plugin.\n// Types will ship as an npm package (@jnana/plugin-api); the shape is shown inline.\n\ninterface PluginContext {{\n  pluginId: string\n  registerNoteType: (def: unknown) => void\n  // storage, notes, bus … (see docs)\n}}\n\ninterface Plugin {{\n  id: string\n  name: string\n  version: string\n  init?: (ctx: PluginContext) => void\n  destroy?: () => void\n}}\n\nconst plugin: Plugin = {{\n  id: '{id}',\n  name: '{name}',\n  version: '0.1.0',\n  init(ctx) {{\n    console.log('{name} loaded', ctx.pluginId)\n    // ctx.registerNoteType({{ id, label, View, Editor }})\n  }},\n}}\n\nexport default plugin\n",
        id = safe_id,
        name = display_name,
    );

    let readme = format!(
        "# {name}\n\nA Jnana plugin.\n\n## Develop\n\n1. `npm install`\n2. Build an ESM bundle to `dist/main.js` (the manifest's `main`).\n3. In Jnana → Settings → Plugins → Developer, use **Load Local Plugin** to point at this folder, or **Package Plugin** to zip it for distribution.\n",
        name = display_name,
    );

    fs::write(root.join("manifest.json"), manifest)
        .and_then(|_| fs::write(root.join("src").join("index.ts"), index))
        .and_then(|_| fs::write(root.join("README.md"), readme))
        .map_err(|e| format!("Failed to write plugin files: {}", e))?;

    Ok(root.to_string_lossy().to_string())
}
