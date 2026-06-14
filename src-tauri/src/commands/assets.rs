use crate::db::{assets_dir, is_within_assets, safe_asset_file};
use std::fs;
use std::path::PathBuf;
use tauri_plugin_opener::OpenerExt;
use uuid::Uuid;

#[tauri::command]
pub fn save_asset(bytes: Vec<u8>, extension: String) -> Result<String, String> {
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
