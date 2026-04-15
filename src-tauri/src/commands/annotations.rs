use crate::db::{queries, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

/// The shape sent to and from the frontend.
/// `position` is stored as a JSON string in the DB so it can represent
/// different coordinate systems — video timestamps, PDF rect, audio offset —
/// without requiring schema changes per media type.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Annotation {
    pub id: String,
    pub note_id: String,
    pub media_id: String,
    /// "video_timestamp" | "pdf_highlight" | "audio_marker"
    pub kind: String,
    /// JSON string — interpreted by the UI based on `kind`
    pub position: String,
    pub content: String,
    pub created_at: i64,
}

impl Annotation {
    fn to_row(&self) -> queries::AnnotationRow {
        queries::AnnotationRow {
            id:         self.id.clone(),
            note_id:    self.note_id.clone(),
            media_id:   self.media_id.clone(),
            kind:       self.kind.clone(),
            position:   self.position.clone(),
            content:    self.content.clone(),
            created_at: self.created_at,
        }
    }

    fn from_row(row: queries::AnnotationRow) -> Self {
        Annotation {
            id:         row.id,
            note_id:    row.note_id,
            media_id:   row.media_id,
            kind:       row.kind,
            position:   row.position,
            content:    row.content,
            created_at: row.created_at,
        }
    }
}

/// Save a new annotation. The frontend generates the id and created_at.
#[command]
pub fn save_annotation(
    state: State<'_, DbState>,
    annotation: Annotation,
) -> Result<Annotation, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Ensure the media_refs row exists so the FK constraint is satisfied.
    // This handles: notes that predate the media_refs feature, files that
    // were re-uploaded (causing register_media_ref to fail silently), and
    // annotations created before the note was first saved.
    let media_type = match annotation.kind.as_str() {
        "video_timestamp" => "video",
        "audio_marker"    => "audio",
        _                 => "pdf",
    };
    conn.execute(
        "INSERT OR IGNORE INTO media_refs (id, note_id, media_type, path, meta)
         VALUES (?1, ?2, ?3, ?1, '{}')",
        rusqlite::params![annotation.media_id, annotation.note_id, media_type],
    ).map_err(|e| format!("Failed to ensure media_ref: {}", e))?;

    queries::insert_annotation(&conn, &annotation.to_row())
        .map_err(|e| format!("Failed to save annotation: {}", e))?;
    Ok(annotation)
}

/// Fetch all annotations belonging to a note (across all its media).
#[command]
pub fn get_annotations_for_note(
    state: State<'_, DbState>,
    note_id: String,
) -> Result<Vec<Annotation>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_annotations_for_note(&conn, &note_id)
        .map(|rows| rows.into_iter().map(Annotation::from_row).collect())
        .map_err(|e| format!("Failed to fetch annotations: {}", e))
}

/// Fetch all annotations for a specific media item (e.g. one video or PDF).
/// Useful when the player only needs its own annotations without loading the full note.
#[command]
pub fn get_annotations_for_media(
    state: State<'_, DbState>,
    media_id: String,
) -> Result<Vec<Annotation>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_annotations_for_media(&conn, &media_id)
        .map(|rows| rows.into_iter().map(Annotation::from_row).collect())
        .map_err(|e| format!("Failed to fetch annotations for media: {}", e))
}

/// Update the text content of an existing annotation.
/// Position and kind are immutable after creation.
#[command]
pub fn update_annotation(
    state: State<'_, DbState>,
    id: String,
    content: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::update_annotation_content(&conn, &id, &content)
        .map_err(|e| format!("Failed to update annotation: {}", e))
}

/// Delete a single annotation by id.
#[command]
pub fn delete_annotation(
    state: State<'_, DbState>,
    id: String,
) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::remove_annotation(&conn, &id)
        .map_err(|e| format!("Failed to delete annotation: {}", e))
}