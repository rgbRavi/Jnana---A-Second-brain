use rusqlite::Result;
use serde::{Deserialize, Serialize};
use tauri::command;
use crate::db::{get_connection, queries, schema};

pub struct NoteRow {
    pub id:         String,
    pub title:      String,
    pub content:    String,
    pub tags:       String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id:         String,
    pub title:      String,
    pub content:    String,
    pub tags:       Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Note {
    fn to_row(&self) -> NoteRow {
        NoteRow {
            id:         self.id.clone(),
            title:      self.title.clone(),
            content:    self.content.clone(),
            tags:       serde_json::to_string(&self.tags).unwrap_or("[]".into()),
            created_at: self.created_at,
            updated_at: self.updated_at,
        }
    }
    fn from_row(row: NoteRow) -> Self {
        Note {
            id:         row.id,
            title:      row.title,
            content:    row.content,
            tags:       serde_json::from_str(&row.tags).unwrap_or_default(),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

fn init_db() -> std::result::Result<rusqlite::Connection, String> {
    let conn = get_connection().map_err(|e| e.to_string())?;
    schema::init(&conn).map_err(|e| e.to_string())?;
    Ok(conn)
}

#[command]
pub fn get_all_notes() -> std::result::Result<Vec<Note>, String> {
    let conn = init_db()?;
    queries::fetch_all_notes(&conn)
        .map(|rows| rows.into_iter().map(Note::from_row).collect())
        .map_err(|e| e.to_string())
}

#[command]
pub fn get_note(id: String) -> std::result::Result<Note, String> {
    let conn = init_db()?;
    queries::fetch_note(&conn, &id)
        .map(Note::from_row)
        .map_err(|e| e.to_string())
}

#[command]
pub fn save_note(note: Note) -> std::result::Result<Note, String> {
    let conn = init_db()?;
    queries::insert_or_update_note(&conn, &note.to_row())
        .map_err(|e| e.to_string())?;
    Ok(note)
}

#[command]
pub fn delete_note(id: String) -> std::result::Result<(), String> {
    let conn = init_db()?;
    queries::remove_note(&conn, &id)
        .map_err(|e| e.to_string())
}

#[command]
pub fn get_links(note_id: String) -> std::result::Result<Vec<String>, String> {
    let conn = init_db()?;
    queries::fetch_links_for_note(&conn, &note_id)
        .map_err(|e| e.to_string())
}

#[command]
pub fn get_all_links() -> std::result::Result<Vec<(String, String)>, String> {
    let conn = init_db()?;
    queries::fetch_all_links(&conn)
        .map_err(|e| e.to_string())
}

#[command]
pub fn create_link(from_id: String, to_id: String) -> std::result::Result<(), String> {
    let conn = init_db()?;
    queries::insert_link(&conn, &from_id, &to_id)
        .map_err(|e| e.to_string())
}

#[command]
pub fn remove_link(from_id: String, to_id: String) -> std::result::Result<(), String> {
    let conn = init_db()?;
    queries::remove_link(&conn, &from_id, &to_id)
        .map_err(|e| e.to_string())
}