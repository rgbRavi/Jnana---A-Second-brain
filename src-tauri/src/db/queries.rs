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
        "INSERT INTO media_refs (id, note_id, media_type, path, meta) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, note_id, media_type, path, meta],
    )?;
    Ok(())
}

pub fn fetch_media_refs(conn: &Connection, note_id: &str) -> Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT path FROM media_refs WHERE note_id = ?1")?;
    let rows = stmt.query_map(params![note_id], |row| row.get(0))?;
    rows.collect()
}
