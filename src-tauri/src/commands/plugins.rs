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

/// How much a single plugin may keep in `plugin_kv`. Plugin side-state is small by
/// nature (a review schedule, a few preferences); the cap exists so a runaway
/// plugin can't quietly inflate the database — and with it every backup — instead
/// of failing where its author can see it.
const MAX_PLUGIN_BYTES: i64 = 5 * 1024 * 1024;

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
    // Measure what this write would cost: the existing footprint, minus whatever
    // this key already holds (an overwrite shouldn't count twice), plus the new row.
    let used = queries::plugin_kv_bytes(&conn, &plugin_id)
        .map_err(|e| format!("Failed to read plugin storage: {}", e))?;
    let existing = queries::plugin_kv_get(&conn, &plugin_id, &key)
        .map_err(|e| format!("Failed to read plugin storage: {}", e))?
        .map(|v| (key.len() + v.len()) as i64)
        .unwrap_or(0);
    if used - existing + (key.len() + value.len()) as i64 > MAX_PLUGIN_BYTES {
        return Err(format!(
            "Plugin storage limit reached ({} MB per plugin).",
            MAX_PLUGIN_BYTES / (1024 * 1024)
        ));
    }
    queries::plugin_kv_set(&conn, &plugin_id, &key, &value)
        .map_err(|e| format!("Failed to write plugin storage: {}", e))
}

/// Every plugin id holding stored data, with key count and size. The manager
/// compares this against what's actually installed to surface leftovers.
#[command]
pub fn plugin_kv_owners(state: State<'_, DbState>) -> Result<Vec<(String, i64, i64)>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::plugin_kv_owners(&conn)
        .map_err(|e| format!("Failed to list plugin storage: {}", e))
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
        "{{\n  \"id\": \"{id}\",\n  \"name\": \"{name}\",\n  \"version\": \"0.1.0\",\n  \"description\": \"\",\n  \"author\": \"\",\n  \"main\": \"dist/main.js\",\n  \"minAppVersion\": \"0.1.0\",\n  \"contributes\": {{ \"noteTypes\": [] }},\n  \"type\": \"utility\",\n  \"permissions\": []\n}}\n",
        id = safe_id,
        name = display_name,
    );

    // A working sample: a note type whose View + Editor use JSX and a hook, so it
    // exercises the host React bridge once built + loaded.
    let index = format!(
        "/// <reference path=\"../jnana-plugin.d.ts\" />\n// {name} — a Jnana plugin. `react` is provided by the host at load time, and the\n// types in jnana-plugin.d.ts give you completion for everything on `ctx`.\nimport {{ useState }} from 'react'\n\nconst plugin: Jnana.Plugin = {{\n  id: '{id}',\n  name: '{name}',\n  version: '0.1.0',\n  init(ctx: Jnana.PluginContext) {{\n    ctx.registerNoteType({{\n      id: '{id}-note',\n      label: '{name} note',\n      newContent: () => 'Hello from {name}!',\n      View: ({{ note }}: Jnana.NoteViewProps) => <div style={{{{ padding: 12 }}}}>{{note.content}}</div>,\n      Editor: ({{ value, onChange }}: Jnana.NoteEditorProps) => {{\n        const [v, setV] = useState(value)\n        return (\n          <textarea\n            style={{{{ width: '100%', minHeight: 140 }}}}\n            value={{v}}\n            onChange={{(e) => {{ setV(e.target.value); onChange(e.target.value) }}}}\n          />\n        )\n      }},\n    }})\n  }},\n}}\n\nexport default plugin\n",
        id = safe_id,
        name = display_name,
    );

    let package_json = format!(
        "{{\n  \"name\": \"{id}\",\n  \"version\": \"0.1.0\",\n  \"private\": true,\n  \"type\": \"module\",\n  \"scripts\": {{\n    \"build\": \"esbuild src/index.tsx --bundle --format=esm --jsx=automatic --external:react --external:react/jsx-runtime --outfile=dist/main.js\"\n  }},\n  \"devDependencies\": {{\n    \"esbuild\": \"^0.24.0\"\n  }}\n}}\n",
        id = safe_id,
    );

    let readme = format!(
        "# {name}\n\nA Jnana plugin.\n\n## Develop\n\n1. `npm install`\n2. `npm run build` — bundles `src/index.tsx` to `dist/main.js` (ESM), with `react` / `react/jsx-runtime` marked **external** (Jnana provides its own React at load time; bundling your own copy breaks hooks).\n3. In Jnana → Settings → Plugins → Developer, use **Load Local Plugin** to install this folder, or **Package Plugin** to zip it for distribution.\n\n## Types\n\n`jnana-plugin.d.ts` sits next to this README and declares the ambient `Jnana` namespace — `Jnana.Plugin`, `Jnana.PluginContext`, `Jnana.NoteTypeDefinition` and the rest. No import needed; your editor picks it up.\n\n## Permissions\n\nDeclare any capabilities your plugin needs in `manifest.json` (`\"permissions\"`): `notes` gates reading/writing notes, and `network` gates HTTP — which also needs a `\"hosts\"` list, e.g. `[\"api.example.com\"]`. Requests to anywhere else are refused, so declare exactly what you call. Add `\"homepage\"` so users can see your source before installing.\n\n## Runtime\n\nThis starter renders a note type, so it runs on the main thread (`\"runtime\": \"main\"`, the default). A plugin that only contributes commands or listens to events can set `\"runtime\": \"worker\"` to run in an isolated Web Worker, where the host answers each capability and refuses any it wasn't granted , prefer that when you don't need to render.\n",
        name = display_name,
    );

    // The plugin API types travel with the scaffold, so `ctx.` completes in the
    // author's editor with no tsconfig, no install and nothing to keep in sync by
    // hand — this is the same file the app is built against.
    const PLUGIN_TYPES: &str = include_str!("../../../examples/types/jnana-plugin.d.ts");

    fs::write(root.join("manifest.json"), manifest)
        .and_then(|_| fs::write(root.join("package.json"), package_json))
        .and_then(|_| fs::write(root.join("src").join("index.tsx"), index))
        .and_then(|_| fs::write(root.join("jnana-plugin.d.ts"), PLUGIN_TYPES))
        .and_then(|_| fs::write(root.join("README.md"), readme))
        .map_err(|e| format!("Failed to write plugin files: {}", e))?;

    Ok(root.to_string_lossy().to_string())
}
