use crate::db::{queries, queries::EmbeddingRow, DbState};
use serde::{Deserialize, Serialize};
use tauri::{command, State};

/// One chunk + its embedding vector, produced by the frontend AI provider
/// and handed to Rust for persistence.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkInput {
    pub chunk_index: i64,
    pub chunk_text: String,
    pub vector: Vec<f32>,
}

/// A retrieval result: which note/chunk matched and how strongly (cosine).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub note_id: String,
    pub chunk_index: i64,
    pub chunk_text: String,
    pub score: f32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStats {
    pub chunk_count: i64,
    pub indexed_note_count: usize,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Cosine similarity between two vectors. Returns 0.0 when either vector is
/// zero-length, has a zero norm, or the dimensions don't match (e.g. the
/// embedding model changed) — those simply rank last instead of erroring.
fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for i in 0..a.len() {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    if na == 0.0 || nb == 0.0 {
        return 0.0;
    }
    dot / (na.sqrt() * nb.sqrt())
}

/// Persist the embeddings for a note, replacing any previous set atomically.
#[command]
pub fn save_note_embeddings(
    state: State<'_, DbState>,
    note_id: String,
    model: String,
    chunks: Vec<ChunkInput>,
) -> Result<(), String> {
    let mut conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let created_at = now_ms();
    let rows: Vec<EmbeddingRow> = chunks
        .into_iter()
        .map(|c| EmbeddingRow {
            id: uuid::Uuid::new_v4().to_string(),
            note_id: note_id.clone(),
            chunk_index: c.chunk_index,
            chunk_text: c.chunk_text,
            vector: c.vector,
            model: model.clone(),
            created_at,
        })
        .collect();

    queries::replace_embeddings_for_note(&mut conn, &note_id, &rows)
        .map_err(|e| format!("Failed to save embeddings: {}", e))
}

/// Semantic search: rank every stored chunk by cosine similarity to the
/// query vector and return the top_k matches. Done in-process because a
/// single user's note set is small enough not to need a vector database.
#[command]
pub fn search_embeddings(
    state: State<'_, DbState>,
    query_vector: Vec<f32>,
    top_k: usize,
) -> Result<Vec<SearchHit>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let chunks = queries::fetch_all_chunks(&conn)
        .map_err(|e| format!("Failed to load chunks: {}", e))?;

    let mut hits: Vec<SearchHit> = chunks
        .into_iter()
        .map(|c| SearchHit {
            score: cosine(&query_vector, &c.vector),
            note_id: c.note_id,
            chunk_index: c.chunk_index,
            chunk_text: c.chunk_text,
        })
        .collect();

    hits.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    hits.truncate(top_k.max(1));
    Ok(hits)
}

#[command]
pub fn delete_note_embeddings(state: State<'_, DbState>, note_id: String) -> Result<(), String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::delete_embeddings_for_note(&conn, &note_id)
        .map_err(|e| format!("Failed to delete embeddings: {}", e))
}

#[command]
pub fn get_indexed_note_ids(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_indexed_note_ids(&conn)
        .map_err(|e| format!("Failed to fetch indexed note ids: {}", e))
}

/// When each indexed note was last embedded — the frontend compares this to a
/// note's `updated_at` to count notes that need (re)indexing.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexTime {
    pub note_id: String,
    pub indexed_at: i64,
}

#[command]
pub fn get_index_times(state: State<'_, DbState>) -> Result<Vec<IndexTime>, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    queries::fetch_index_times(&conn)
        .map(|rows| {
            rows.into_iter()
                .map(|(note_id, indexed_at)| IndexTime { note_id, indexed_at })
                .collect()
        })
        .map_err(|e| format!("Failed to fetch index times: {}", e))
}

#[command]
pub fn get_index_stats(state: State<'_, DbState>) -> Result<IndexStats, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let chunk_count = queries::count_embeddings(&conn)
        .map_err(|e| format!("Failed to count embeddings: {}", e))?;
    let indexed_note_count = queries::fetch_indexed_note_ids(&conn)
        .map_err(|e| format!("Failed to fetch indexed note ids: {}", e))?
        .len();
    Ok(IndexStats { chunk_count, indexed_note_count })
}
