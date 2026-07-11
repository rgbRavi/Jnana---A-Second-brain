// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use crate::db::{assets_dir, DbState};
use serde::Serialize;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

use std::process::Command;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A recently-imported media file, joined to the note it belongs to.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentMediaRow {
    pub filename: String,
    pub media_type: String,
    pub note_id: String,
    pub note_title: String,
    pub created_at: i64,
}

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
    std::fs::copy(source, &dest).map_err(|e| {
        log::error!("import_media: failed to copy {} → {}: {}", file_path, dest.display(), e);
        format!("Failed to copy media file: {}", e)
    })?;

    Ok(filename)
}

#[tauri::command]
pub async fn convert_to_pdf(file_path: String) -> Result<String, String> {
    let source_path = Path::new(&file_path);
    if !source_path.exists() {
        return Err("File does not exist".to_string());
    }

    let out_dir = std::env::temp_dir();
    let out_file = out_dir.join(source_path.with_extension("pdf").file_name().unwrap());
    let mut success = false;

    // 1. Try LibreOffice — check PATH first, then common Windows install locations.
    //    soffice is not always on PATH even when LibreOffice is installed.
    let soffice_candidates: &[&str] = &[
        "soffice",
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ];

    for candidate in soffice_candidates {
        let mut cmd = Command::new(candidate);
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
                break;
            }
        }
    }

    // 2. Pandoc fallback — explicitly request the libreoffice PDF engine so
    //    Pandoc never falls through to pdflatex/MikTeX which prompts for package installs.
    if !success || !out_file.exists() {
        let mut pdf_cmd = Command::new("pandoc");
        pdf_cmd.args([
            &file_path,
            "-o",
            out_file.to_str().unwrap(),
            "--pdf-engine=libreoffice",
        ]);
        if let Ok(status) = pdf_cmd.status() {
            if status.success() {
                success = true;
            }
        }
    }

    if !success || !out_file.exists() {
        log::error!("convert_to_pdf: no converter (LibreOffice/Pandoc) succeeded for {}", file_path);
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
        _ => {
            log::error!("extract_text: pandoc failed for {}", file_path);
            Err("Failed to extract text using Pandoc. Make sure Pandoc is installed, or try importing as PDF.".to_string())
        }
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
    // Use the filename as the media_refs.id — import_media already generates a UUID-based
    // filename, so it's unique. This lets PdfViewer (and other viewers) pass the filename
    // directly as mediaId when creating annotations, satisfying the FK constraint.
    crate::db::queries::insert_media_ref(&conn, &filename, &note_id, &media_type, &filename, "{}", now_ms())
        .map_err(|e| format!("Failed to insert media_ref: {}", e))
}

/// Most-recently imported media across the vault (for the dashboard's Recent Imports).
#[tauri::command]
pub fn recent_media(state: State<'_, DbState>, limit: u32) -> Result<Vec<RecentMediaRow>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    crate::db::queries::recent_media(&conn, limit as i64)
        .map_err(|e| format!("Failed to fetch recent media: {}", e))
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


#[tauri::command]
pub fn get_media_types(
    state: State<'_, DbState>,
    note_id: String,
) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    crate::db::queries::fetch_media_types(&conn, &note_id)
        .map_err(|e| format!("Failed to fetch media refs: {}", e))
}