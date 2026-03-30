use crate::db::assets_dir;
use std::fs;
use uuid::Uuid;

#[tauri::command]
pub fn save_asset(bytes: Vec<u8>, extension: String) -> Result<String, String> {
    let dir = assets_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create assets directory: {}", e))?;

    let id = Uuid::new_v4().to_string();
    let filename = format!("{}.{}", id, extension);
    let filepath = dir.join(&filename);

    fs::write(&filepath, bytes)
        .map_err(|e| format!("Failed to write asset: {}", e))?;

    Ok(filename)
}

#[tauri::command]
pub fn get_asset(filename: String) -> Result<Vec<u8>, String> {
    let filepath = assets_dir().join(&filename);
    fs::read(&filepath)
        .map_err(|e| format!("Failed to read asset {}: {}", filename, e))
}

#[tauri::command]
pub fn get_asset_path(filename: String) -> Result<String, String> {
    let filepath = assets_dir().join(&filename);
    if filepath.exists() {
        Ok(filepath.to_string_lossy().to_string())
    } else {
        Err(format!("Asset not found: {}", filename))
    }
}
