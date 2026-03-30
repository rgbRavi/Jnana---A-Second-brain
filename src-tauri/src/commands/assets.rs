use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

pub fn assets_path() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("jnana").join("assets")
}

#[tauri::command]
pub fn save_asset(bytes: Vec<u8>, extension: String) -> Result<String, String> {
    let dir = assets_path();
    if !dir.exists() {
        if let Err(e) = fs::create_dir_all(&dir) {
            return Err(format!("Failed to create assets directory: {}", e));
        }
    }

    let id = Uuid::new_v4().to_string();
    let filename = format!("{}.{}", id, extension);
    let filepath = dir.join(&filename);

    match fs::write(&filepath, bytes) {
        Ok(_) => Ok(filename),
        Err(e) => Err(format!("Failed to write asset: {}", e)),
    }
}

#[tauri::command]
pub fn get_asset(filename: String) -> Result<Vec<u8>, String> {
    let dir = assets_path();
    let filepath = dir.join(filename);
    
    match fs::read(&filepath) {
        Ok(bytes) => Ok(bytes),
        Err(e) => Err(format!("Failed to read asset: {}", e)),
    }
}
