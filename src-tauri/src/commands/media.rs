use crate::db::{assets_dir, DbState};
use std::path::Path;
use tauri::State;

/// Copy a video file into the assets directory and return the filename.
///
/// Deliberately does NOT insert a media_refs row here — the note with
/// note_id may not exist in the DB yet (draft in NoteCreator). The
/// media_refs row is written by register_media_ref once the note is saved.
#[tauri::command]
pub fn import_vid(
    _state: State<'_, DbState>,
    file_path: String,
    _note_id: String,
) -> Result<String, String> {
    let source = Path::new(&file_path);
    if !source.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let ext = source.extension().and_then(|s| s.to_str()).unwrap_or("mp4");
    let uuid = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}.{}", uuid, ext);

    let dir = assets_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let dest = dir.join(&filename);
    std::fs::copy(source, &dest)
        .map_err(|e| format!("Failed to copy video file: {}", e))?;

    Ok(filename)
}

/// Insert a media_refs row after the note has been confirmed saved.
/// Call this from the frontend once save_note succeeds.
#[tauri::command]
pub fn register_media_ref(
    state: State<'_, DbState>,
    note_id: String,
    media_type: String,
    filename: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let media_id = uuid::Uuid::new_v4().to_string();
    crate::db::queries::insert_media_ref(&conn, &media_id, &note_id, &media_type, &filename, "{}")
        .map_err(|e| format!("Failed to insert media_ref: {}", e))
}

#[tauri::command]
pub fn get_media_refs(
    state: State<'_, DbState>,
    note_id: String,
) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    crate::db::queries::fetch_media_refs(&conn, &note_id)
        .map_err(|e| format!("Failed to fetch media refs: {}", e))
}
