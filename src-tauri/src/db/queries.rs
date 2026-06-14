use crate::commands::ai_workspace::{KnowledgeRow, PresetRow, ProjectRow};
use crate::commands::chat::{ConversationMeta, ConversationRow};
use crate::commands::notes::NoteRow;
use rusqlite::{params, Connection, Result};

// ─── Notes ──────────────────────────────────────────────

pub fn insert_or_update_note(conn: &Connection, note: &NoteRow) -> Result<()> {
    conn.execute(
        "INSERT INTO notes (id, title, content, tags, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           title      = excluded.title,
           content    = excluded.content,
           tags       = excluded.tags,
           updated_at = excluded.updated_at",
        params![
            note.id,
            note.title,
            note.content,
            note.tags,
            note.created_at,
            note.updated_at,
        ],
    )?;
    Ok(())
}

pub fn fetch_all_notes(conn: &Connection) -> Result<Vec<NoteRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, tags, created_at, updated_at
         FROM notes ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(NoteRow {
            id:         row.get(0)?,
            title:      row.get(1)?,
            content:    row.get(2)?,
            tags:       row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn fetch_note(conn: &Connection, id: &str) -> Result<NoteRow> {
    conn.query_row(
        "SELECT id, title, content, tags, created_at, updated_at
         FROM notes WHERE id = ?1",
        params![id],
        |row| {
            Ok(NoteRow {
                id:         row.get(0)?,
                title:      row.get(1)?,
                content:    row.get(2)?,
                tags:       row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )
}

/// Fetch all asset filenames associated with a note (from media_refs + inline content).
/// Used to clean up physical files before deleting a note.
pub fn fetch_asset_paths_for_note(conn: &Connection, note_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT path FROM media_refs WHERE note_id = ?1")?;
    let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
    rows.collect()
}

pub fn remove_note(conn: &Connection, id: &str) -> Result<()> {
    // With PRAGMA foreign_keys = ON + ON DELETE CASCADE,
    // deleting the note automatically cleans up links, media_refs, and annotations.
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(())
}

// ─── Links ──────────────────────────────────────────────

pub fn insert_link(conn: &Connection, from_id: &str, to_id: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO links (from_id, to_id) VALUES (?1, ?2)",
        params![from_id, to_id],
    )?;
    Ok(())
}

pub fn remove_link(conn: &Connection, from_id: &str, to_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM links WHERE from_id = ?1 AND to_id = ?2",
        params![from_id, to_id],
    )?;
    Ok(())
}

/// Diff-and-apply the outbound wikilinks for one note, entirely in SQLite —
/// one IPC round-trip instead of pulling every note + link into the WebView.
///
/// `titles` are the `[[wikilink]]` targets found in the note content, matched
/// case-insensitively against note titles (Unicode-aware lowering happens here
/// in Rust because SQLite's LOWER() only handles ASCII). Inbound links from
/// other notes are untouched. Returns the (added, removed) target note ids so
/// the frontend can emit its link events.
pub fn sync_links_for_note(
    conn: &mut Connection,
    note_id: &str,
    titles: &[String],
) -> Result<(Vec<String>, Vec<String>)> {
    use std::collections::HashSet;

    let wanted: HashSet<String> = titles.iter().map(|t| t.trim().to_lowercase()).collect();

    let tx = conn.transaction()?;

    // Resolve wikilink titles → note ids (skipping self-links).
    let mut target_ids: HashSet<String> = HashSet::new();
    {
        let mut stmt = tx.prepare("SELECT id, title FROM notes")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (id, title) = row?;
            if id != note_id && wanted.contains(&title.trim().to_lowercase()) {
                target_ids.insert(id);
            }
        }
    }

    let outbound: HashSet<String> = {
        let mut stmt = tx.prepare("SELECT to_id FROM links WHERE from_id = ?1")?;
        let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
        rows.collect::<Result<_>>()?
    };

    let added: Vec<String> = target_ids.difference(&outbound).cloned().collect();
    let removed: Vec<String> = outbound.difference(&target_ids).cloned().collect();

    for to_id in &added {
        tx.execute(
            "INSERT OR IGNORE INTO links (from_id, to_id) VALUES (?1, ?2)",
            params![note_id, to_id],
        )?;
    }
    for to_id in &removed {
        tx.execute(
            "DELETE FROM links WHERE from_id = ?1 AND to_id = ?2",
            params![note_id, to_id],
        )?;
    }

    tx.commit()?;
    Ok((added, removed))
}

pub fn fetch_links_for_note(conn: &Connection, note_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT to_id FROM links WHERE from_id = ?1
         UNION
         SELECT from_id FROM links WHERE to_id = ?1",
    )?;
    let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
    rows.collect()
}

pub fn fetch_all_links(conn: &Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT from_id, to_id FROM links")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

// ─── Conversations (AI chat history) ────────────────────

pub fn upsert_conversation(conn: &Connection, c: &ConversationRow) -> Result<()> {
    conn.execute(
        "INSERT INTO conversations (id, mode, title, messages, scope, project_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           title      = excluded.title,
           messages   = excluded.messages,
           scope      = excluded.scope,
           project_id = excluded.project_id,
           updated_at = excluded.updated_at",
        params![c.id, c.mode, c.title, c.messages, c.scope, c.project_id, c.created_at, c.updated_at],
    )?;
    Ok(())
}

pub fn fetch_conversation(conn: &Connection, id: &str) -> Result<ConversationRow> {
    conn.query_row(
        "SELECT id, mode, title, messages, scope, project_id, created_at, updated_at
         FROM conversations WHERE id = ?1",
        params![id],
        |row| {
            Ok(ConversationRow {
                id: row.get(0)?,
                mode: row.get(1)?,
                title: row.get(2)?,
                messages: row.get(3)?,
                scope: row.get(4)?,
                project_id: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
}

pub fn list_conversations(conn: &Connection, mode: Option<&str>) -> Result<Vec<ConversationMeta>> {
    let to_meta = |row: &rusqlite::Row| {
        Ok(ConversationMeta {
            id: row.get(0)?,
            mode: row.get(1)?,
            title: row.get(2)?,
            project_id: row.get(3)?,
            updated_at: row.get(4)?,
        })
    };
    match mode {
        Some(m) => {
            let mut stmt = conn.prepare(
                "SELECT id, mode, title, project_id, updated_at FROM conversations
                 WHERE mode = ?1 ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map(params![m], to_meta)?;
            rows.collect()
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT id, mode, title, project_id, updated_at FROM conversations ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map([], to_meta)?;
            rows.collect()
        }
    }
}

pub fn delete_conversation(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn rename_conversation(conn: &Connection, id: &str, title: &str, updated_at: i64) -> Result<()> {
    conn.execute(
        "UPDATE conversations SET title = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, title, updated_at],
    )?;
    Ok(())
}

// ─── AI presets (Styles & Skills) ───────────────────────

pub fn list_presets(conn: &Connection, kind: &str) -> Result<Vec<PresetRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, name, description, body, created_at, updated_at
         FROM ai_presets WHERE kind = ?1 ORDER BY name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map(params![kind], |row| {
        Ok(PresetRow {
            id: row.get(0)?,
            kind: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            body: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn upsert_preset(conn: &Connection, p: &PresetRow) -> Result<()> {
    conn.execute(
        "INSERT INTO ai_presets (id, kind, name, description, body, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           name        = excluded.name,
           description = excluded.description,
           body        = excluded.body,
           updated_at  = excluded.updated_at",
        params![p.id, p.kind, p.name, p.description, p.body, p.created_at, p.updated_at],
    )?;
    Ok(())
}

pub fn delete_preset(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM ai_presets WHERE id = ?1", params![id])?;
    Ok(())
}

// ─── AI projects + knowledge ────────────────────────────

pub fn list_projects(conn: &Connection) -> Result<Vec<ProjectRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, instructions, created_at, updated_at
         FROM ai_projects ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(ProjectRow {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            instructions: row.get(3)?,
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn upsert_project(conn: &Connection, p: &ProjectRow) -> Result<()> {
    conn.execute(
        "INSERT INTO ai_projects (id, name, description, instructions, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name         = excluded.name,
           description  = excluded.description,
           instructions = excluded.instructions,
           updated_at   = excluded.updated_at",
        params![p.id, p.name, p.description, p.instructions, p.created_at, p.updated_at],
    )?;
    Ok(())
}

pub fn delete_project(conn: &Connection, id: &str) -> Result<()> {
    // Knowledge rows cascade; detach any conversations that belonged to it.
    conn.execute("UPDATE conversations SET project_id = NULL WHERE project_id = ?1", params![id])?;
    conn.execute("DELETE FROM ai_projects WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn list_project_knowledge(conn: &Connection, project_id: &str) -> Result<Vec<KnowledgeRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, kind, ref_id, label, created_at
         FROM ai_project_knowledge WHERE project_id = ?1 ORDER BY created_at",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        Ok(KnowledgeRow {
            id: row.get(0)?,
            project_id: row.get(1)?,
            kind: row.get(2)?,
            ref_id: row.get(3)?,
            label: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect()
}

pub fn insert_project_knowledge(conn: &Connection, k: &KnowledgeRow) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO ai_project_knowledge (id, project_id, kind, ref_id, label, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![k.id, k.project_id, k.kind, k.ref_id, k.label, k.created_at],
    )?;
    Ok(())
}

pub fn delete_project_knowledge(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM ai_project_knowledge WHERE id = ?1", params![id])?;
    Ok(())
}

// ─── Media Refs ─────────────────────────────────────────

pub fn insert_media_ref(
    conn: &Connection,
    id: &str,
    note_id: &str,
    media_type: &str,
    path: &str,
    meta: &str,
) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO media_refs (id, note_id, media_type, path, meta) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, note_id, media_type, path, meta],
    )?;
    Ok(())
}

pub fn fetch_media_refs(conn: &Connection, note_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT path FROM media_refs WHERE note_id = ?1")?;
    let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
    rows.collect()
}

pub fn fetch_media_types(conn: &Connection, note_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT media_type FROM media_refs WHERE note_id = ?1")?;
    let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
    rows.collect()
}

// ─── Annotations ────────────────────────────────────────

pub struct AnnotationRow {
    pub id: String,
    pub note_id: String,
    pub media_id: String,
    pub kind: String,
    pub position: String,
    pub content: String,
    pub created_at: i64,
}

pub fn insert_annotation(
    conn: &Connection,
    row: &AnnotationRow,
) -> Result<()> {
    conn.execute(
        "INSERT INTO annotations (id, note_id, media_id, kind, position, content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            row.id,
            row.note_id,
            row.media_id,
            row.kind,
            row.position,
            row.content,
            row.created_at,
        ],
    )?;
    Ok(())
}

pub fn fetch_annotations_for_note(
    conn: &Connection,
    note_id: &str,
) -> Result<Vec<AnnotationRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, media_id, kind, position, content, created_at
         FROM annotations
         WHERE note_id = ?1
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![note_id], |row| {
        Ok(AnnotationRow {
            id:         row.get(0)?,
            note_id:    row.get(1)?,
            media_id:   row.get(2)?,
            kind:       row.get(3)?,
            position:   row.get(4)?,
            content:    row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn fetch_annotations_for_media(
    conn: &Connection,
    media_id: &str,
) -> Result<Vec<AnnotationRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, media_id, kind, position, content, created_at
         FROM annotations
         WHERE media_id = ?1
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map(params![media_id], |row| {
        Ok(AnnotationRow {
            id:         row.get(0)?,
            note_id:    row.get(1)?,
            media_id:   row.get(2)?,
            kind:       row.get(3)?,
            position:   row.get(4)?,
            content:    row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect()
}

pub fn update_annotation_content(
    conn: &Connection,
    id: &str,
    content: &str,
) -> Result<()> {
    conn.execute(
        "UPDATE annotations SET content = ?1 WHERE id = ?2",
        params![content, id],
    )?;
    Ok(())
}

pub fn remove_annotation(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM annotations WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn add_favourite(conn: &Connection, note_id: &str) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO favourites (note_id) VALUES (?1)",
        params![note_id],
    )?;
    Ok(())
}

pub fn fetch_favourite_note_ids(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT note_id FROM favourites")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

pub fn remove_favourite(conn: &Connection, note_id: &str) -> Result<()> {
    conn.execute("DELETE FROM favourites WHERE note_id = ?1", params![note_id])?;
    Ok(())
}

// ─── Embeddings (RAG vector store) ──────────────────────

pub struct EmbeddingRow {
    pub id: String,
    pub note_id: String,
    pub chunk_index: i64,
    pub chunk_text: String,
    pub vector: Vec<f32>,
    pub model: String,
    pub created_at: i64,
}

/// Pack an f32 vector into a little-endian byte BLOB.
fn vector_to_blob(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(vector.len() * 4);
    for v in vector {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    bytes
}

/// Unpack a little-endian byte BLOB back into an f32 vector.
fn blob_to_vector(bytes: &[u8]) -> Vec<f32> {
    bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect()
}

/// Replace every embedding for a note in a single transaction.
/// Re-indexing a note deletes its stale chunks first, then inserts the new set.
pub fn replace_embeddings_for_note(
    conn: &mut Connection,
    note_id: &str,
    rows: &[EmbeddingRow],
) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM embeddings WHERE note_id = ?1", params![note_id])?;
    for row in rows {
        let blob = vector_to_blob(&row.vector);
        tx.execute(
            "INSERT INTO embeddings
               (id, note_id, chunk_index, chunk_text, vector, dim, model, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                row.id,
                row.note_id,
                row.chunk_index,
                row.chunk_text,
                blob,
                row.vector.len() as i64,
                row.model,
                row.created_at,
            ],
        )?;
    }
    tx.commit()
}

pub fn delete_embeddings_for_note(conn: &Connection, note_id: &str) -> Result<()> {
    conn.execute("DELETE FROM embeddings WHERE note_id = ?1", params![note_id])?;
    Ok(())
}

/// A single stored chunk plus its decoded vector, used for in-memory search.
pub struct StoredChunk {
    pub note_id: String,
    pub chunk_index: i64,
    pub chunk_text: String,
    pub vector: Vec<f32>,
}

/// Load every chunk vector. The vector store is small (one user's notes),
/// so a full scan + cosine in Rust is fast enough and avoids a vector DB.
pub fn fetch_all_chunks(conn: &Connection) -> Result<Vec<StoredChunk>> {
    let mut stmt = conn.prepare(
        "SELECT note_id, chunk_index, chunk_text, vector FROM embeddings",
    )?;
    let rows = stmt.query_map([], |row| {
        let blob: Vec<u8> = row.get(3)?;
        Ok(StoredChunk {
            note_id: row.get(0)?,
            chunk_index: row.get(1)?,
            chunk_text: row.get(2)?,
            vector: blob_to_vector(&blob),
        })
    })?;
    rows.collect()
}

/// Distinct note ids that currently have at least one embedding,
/// so the indexer can skip already-indexed notes.
pub fn fetch_indexed_note_ids(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT DISTINCT note_id FROM embeddings")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    rows.collect()
}

pub fn count_embeddings(conn: &Connection) -> Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM embeddings", [], |r| r.get(0))
}

/// (note_id, latest embedding `created_at`) per indexed note, so the UI can
/// flag notes edited since they were last indexed.
pub fn fetch_index_times(conn: &Connection) -> Result<Vec<(String, i64)>> {
    let mut stmt = conn.prepare("SELECT note_id, MAX(created_at) FROM embeddings GROUP BY note_id")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use crate::db::schema::run_migrations;

    fn setup_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn test_insert_and_fetch_note() {
        let conn = setup_db();
        let note = NoteRow {
            id: "1".to_string(),
            title: "Test Note".to_string(),
            content: "Hello World".to_string(),
            tags: "[]".to_string(),
            created_at: 12345,
            updated_at: 12345,
        };

        insert_or_update_note(&conn, &note).unwrap();

        let fetched = fetch_note(&conn, "1").unwrap();
        assert_eq!(fetched.title, "Test Note");
        assert_eq!(fetched.content, "Hello World");

        let all = fetch_all_notes(&conn).unwrap();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn test_sync_links_for_note() {
        let mut conn = setup_db();
        
        // Insert notes
        let note1 = NoteRow { id: "1".to_string(), title: "Source".to_string(), content: "".to_string(), tags: "[]".to_string(), created_at: 0, updated_at: 0 };
        let note2 = NoteRow { id: "2".to_string(), title: "Target One".to_string(), content: "".to_string(), tags: "[]".to_string(), created_at: 0, updated_at: 0 };
        let note3 = NoteRow { id: "3".to_string(), title: "Target Two".to_string(), content: "".to_string(), tags: "[]".to_string(), created_at: 0, updated_at: 0 };
        
        insert_or_update_note(&conn, &note1).unwrap();
        insert_or_update_note(&conn, &note2).unwrap();
        insert_or_update_note(&conn, &note3).unwrap();

        // 1. Initial sync (adds link to note 2)
        let titles = vec!["target one".to_string()];
        let (added, removed) = sync_links_for_note(&mut conn, "1", &titles).unwrap();
        assert_eq!(added, vec!["2".to_string()]);
        assert!(removed.is_empty());

        let links = fetch_links_for_note(&conn, "1").unwrap();
        assert_eq!(links, vec!["2".to_string()]);

        // 2. Second sync (removes note 2, adds note 3)
        let titles = vec!["Target Two".to_string()];
        let (added, removed) = sync_links_for_note(&mut conn, "1", &titles).unwrap();
        assert_eq!(added, vec!["3".to_string()]);
        assert_eq!(removed, vec!["2".to_string()]);

        let links = fetch_links_for_note(&conn, "1").unwrap();
        assert_eq!(links, vec!["3".to_string()]);
    }

    #[test]
    fn test_sync_links_skips_self_and_removes_stale() {
        let mut conn = setup_db();
        let note1 = NoteRow { id: "1".to_string(), title: "Source".to_string(), content: "".to_string(), tags: "[]".to_string(), created_at: 0, updated_at: 0 };
        let note2 = NoteRow { id: "2".to_string(), title: "Target One".to_string(), content: "".to_string(), tags: "[]".to_string(), created_at: 0, updated_at: 0 };
        insert_or_update_note(&conn, &note1).unwrap();
        insert_or_update_note(&conn, &note2).unwrap();

        sync_links_for_note(&mut conn, "1", &vec!["target one".to_string()]).unwrap();

        // Linking a note to its own title resolves to self → skipped, and the
        // previously-added link is now stale → removed.
        let (added, removed) = sync_links_for_note(&mut conn, "1", &vec!["source".to_string()]).unwrap();
        assert!(added.is_empty());
        assert_eq!(removed, vec!["2".to_string()]);
        assert!(fetch_links_for_note(&conn, "1").unwrap().is_empty());
    }

    #[test]
    fn test_sync_links_ignores_unresolved_titles() {
        let mut conn = setup_db();
        let note1 = NoteRow { id: "1".to_string(), title: "Source".to_string(), content: "".to_string(), tags: "[]".to_string(), created_at: 0, updated_at: 0 };
        insert_or_update_note(&conn, &note1).unwrap();

        let (added, removed) = sync_links_for_note(&mut conn, "1", &vec!["does not exist".to_string()]).unwrap();
        assert!(added.is_empty());
        assert!(removed.is_empty());
    }
}