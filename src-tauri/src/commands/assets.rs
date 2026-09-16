// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use crate::db::{assets_dir, is_within_assets, safe_asset_file};
use std::fs;
use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request};
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

/// Store raw bytes (a clipboard paste, a canvas drawing) as an asset.
///
/// Takes a raw `Request` body rather than `bytes: Vec<u8>` because the default
/// IPC encoding is JSON: a `Vec<u8>` argument arrives as an array of numbers,
/// which the frontend must build with `Array.from()` and serialize element by
/// element. That is fine for a screenshot and pathological for a video — tens
/// of millions of array entries, hundreds of megabytes of JSON text, and a
/// frozen webview. The raw body is the bytes themselves. The extension rides
/// along in a header since the body is no longer a JSON object.
#[tauri::command]
pub fn save_asset(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_asset expects a raw byte body".to_string());
    };
    let extension = request
        .headers()
        .get("x-extension")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let dir = assets_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create assets directory: {}", e))?;

    // The extension is interpolated into the filename, so strip it to safe
    // characters — otherwise a value like "../../evil" would escape the dir.
    let ext: String = extension.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    let id = Uuid::new_v4().to_string();
    let filename = if ext.is_empty() { id.clone() } else { format!("{}.{}", id, ext) };
    let filepath = dir.join(&filename);

    fs::write(&filepath, bytes)
        .map_err(|e| format!("Failed to write asset: {}", e))?;

    Ok(filename)
}

/// Write raw bytes to a fresh temp directory and return the full path.
///
/// Staging area for a pasted document. The document import pipeline is
/// path-based throughout — LibreOffice conversion, pandoc extraction, the
/// spreadsheet reader, and `external://` chips all take a path — so a paste
/// gets one and then follows exactly the same code path as a file picked from
/// the dialog. Not written into the assets dir: most branches copy the file
/// into assets themselves, and a staged copy there would be an orphan.
#[tauri::command]
pub fn save_temp_file(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_temp_file expects a raw byte body".to_string());
    };
    // Same alphanumeric-only treatment as save_asset: the extension is
    // interpolated into a filename, and this one comes off the clipboard.
    let ext: String = request
        .headers()
        .get("x-extension")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();

    let dir = std::env::temp_dir().join(format!("jnana-paste-{}", Uuid::new_v4()));
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let name = if ext.is_empty() { "document".to_string() } else { format!("document.{}", ext) };
    let path = dir.join(name);
    fs::write(&path, bytes).map_err(|e| format!("Failed to write temp file: {}", e))?;

    path.to_str().map(str::to_string).ok_or_else(|| "Invalid temp path".to_string())
}

/// Copy a user-picked file (from a native file dialog) into the assets dir and
/// return its stored filename. Unlike `import_media` this records no media_ref —
/// it's for AI-chat attachments, which belong to a conversation, not a note. The
/// frontend already has the original path's extension to classify/derive mime.
#[tauri::command]
pub fn import_file(path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let bytes = fs::read(&src).map_err(|e| format!("Failed to read file: {}", e))?;

    let dir = assets_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create assets directory: {}", e))?;

    // Sanitise the extension before interpolating it into the filename.
    let ext: String = src
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    let id = Uuid::new_v4().to_string();
    let filename = if ext.is_empty() { id.clone() } else { format!("{}.{}", id, ext) };

    fs::write(dir.join(&filename), &bytes)
        .map_err(|e| format!("Failed to write asset: {}", e))?;

    Ok(filename)
}

#[tauri::command]
pub fn get_asset(filename: String) -> Result<Vec<u8>, String> {
    let filepath = safe_asset_file(&filename)?;
    fs::read(&filepath)
        .map_err(|e| format!("Failed to read asset {}: {}", filename, e))
}

#[tauri::command]
pub fn get_asset_path(filename: String) -> Result<String, String> {
    let filepath = safe_asset_file(&filename)?;
    if filepath.exists() {
        Ok(filepath.to_string_lossy().to_string())
    } else {
        Err(format!("Asset not found: {}", filename))
    }
}

/// Open an app-managed asset in the system's default application.
///
/// Replaces a blanket `opener:allow-open-path` capability: `path` must resolve
/// to a file inside `assets_dir()`, so the WebView can only open files Jnana
/// itself copied in (e.g. imported documents), never arbitrary host files.
#[tauri::command]
pub fn open_asset(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !is_within_assets(&target) {
        return Err("Refusing to open a path outside the assets directory".into());
    }
    app.opener()
        .open_path(target.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open asset: {}", e))
}
