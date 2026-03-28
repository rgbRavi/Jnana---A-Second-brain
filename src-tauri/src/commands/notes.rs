use serde::{Deserialize, Serialize};
use std::fs;
use tauri::command;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

fn notes_dir() -> std::path::PathBuf {
    let home = dirs::data_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    home.join("jnana").join("notes")
}

#[command]
pub fn get_all_notes() -> Result<Vec<Note>, String> {
    let dir = notes_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut notes = vec![];
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let note: Note = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            notes.push(note);
        }
    }
    Ok(notes)
}

#[command]
pub fn get_note(id: String) -> Result<Note, String> {
    let path = notes_dir().join(format!("{}.json", id));
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[command]
pub fn save_note(note: Note) -> Result<Note, String> {
    let dir = notes_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", note.id));
    let text = serde_json::to_string_pretty(&note).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(note)
}

#[command]
pub fn delete_note(id: String) -> Result<(), String> {
    let path = notes_dir().join(format!("{}.json", id));
    fs::remove_file(&path).map_err(|e| e.to_string())
}