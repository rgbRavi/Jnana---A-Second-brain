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
    queries::insert_or_update_note(&conn, &note.to_row())
        .map_err(|e| format!("Failed to save note: {}", e))?;
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
    queries::remove_note(&conn, &id)
        .map_err(|e| format!("Failed to delete note {}: {}", id, e))?;

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
