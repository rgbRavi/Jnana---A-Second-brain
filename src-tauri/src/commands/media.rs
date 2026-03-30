use crate::db::{queries, assets_dir, DbState};
use std::path::Path;
use tauri::State;

#[tauri::command]
pub fn import_vid(
    state: State<'_, DbState>,
    file_path: String,
    note_id: String,
) -> Result<String, String> {
    let source = Path::new(&file_path);
    if !source.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let ext = source.extension().and_then(|s| s.to_str()).unwrap_or("mp4");
    let uuid = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}.{}", uuid, ext);

    let dir = assets_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let dest = dir.join(&filename);
    std::fs::copy(source, &dest)
        .map_err(|e| format!("Failed to copy video file: {}", e))?;

    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let media_id = uuid::Uuid::new_v4().to_string();

    queries::insert_media_ref(&conn, &media_id, &note_id, "video", &filename, "{}")
        .map_err(|e| format!("Failed to insert media_ref: {}", e))?;

    Ok(filename)
}

#[tauri::command]
pub fn get_media_refs(
    state: State<'_, DbState>,
    note_id: String,
) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_media_refs(&conn, &note_id)
        .map_err(|e| format!("Failed to fetch media refs: {}", e))
}
