use crate::db::{assets_dir, DbState};
use std::path::Path;
use tauri::State;

use std::process::Command;

/// Copy a media file into the assets directory and return the filename.
///
/// Deliberately does NOT insert a media_refs row here — the note with
/// note_id may not exist in the DB yet (draft in NoteCreator). The
/// media_refs row is written by register_media_ref once the note is saved.
#[tauri::command]
pub fn import_media(
    _state: State<'_, DbState>,
    file_path: String,
    _note_id: String,
) -> Result<String, String> {
    let source = Path::new(&file_path);
    if !source.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let ext = source.extension().and_then(|s| s.to_str()).unwrap_or("bin");
    let uuid = uuid::Uuid::new_v4().to_string();
    let filename = format!("{}.{}", uuid, ext);

    let dir = assets_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let dest = dir.join(&filename);
    std::fs::copy(source, &dest)
        .map_err(|e| format!("Failed to copy media file: {}", e))?;

    Ok(filename)
}

#[tauri::command]
pub async fn convert_to_pdf(file_path: String) -> Result<String, String> {
    let source_path = Path::new(&file_path);
    if !source_path.exists() {
        return Err("File does not exist".to_string());
    }

    let out_dir = std::env::temp_dir();
    let mut success = false;
    
    // 1. Try LibreOffice primary pathway
    let mut cmd = Command::new("soffice"); // "soffice" is the standard LibreOffice cli executable
    cmd.args([
        "--headless",
        "--convert-to",
        "pdf",
        &file_path,
        "--outdir",
        out_dir.to_str().unwrap(),
    ]);

    if let Ok(status) = cmd.status() {
        if status.success() {
            success = true;
        }
    }

    let out_file = out_dir.join(source_path.with_extension("pdf").file_name().unwrap());

    // 2. Try Pandoc fallback
    if !success || !out_file.exists() {
        let mut pdf_cmd = Command::new("pandoc");
        pdf_cmd.args([&file_path, "-o", out_file.to_str().unwrap()]);
        if let Ok(status) = pdf_cmd.status() {
            if status.success() {
                success = true;
            }
        }
    }

    if !success || !out_file.exists() {
        return Err("Failed to convert document to PDF. Ensure LibreOffice or Pandoc+PDFEngine is installed and in your system PATH.".to_string());
    }

    Ok(out_file.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn extract_text(file_path: String) -> Result<String, String> {
    let mut cmd = Command::new("pandoc");
    cmd.args(["-t", "plain", &file_path]);

    match cmd.output() {
        Ok(output) if output.status.success() => {
            Ok(String::from_utf8_lossy(&output.stdout).to_string())
        }
        _ => Err("Failed to extract text using Pandoc. Make sure Pandoc is installed, or try importing as PDF.".to_string()),
    }
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
