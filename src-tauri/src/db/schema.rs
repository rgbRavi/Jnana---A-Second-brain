use rusqlite::{Connection, Result};


/// Run all pending migrations in order.
/// This is safe to call on every app launch — it only applies new migrations.
pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Ensure the version tracking table exists (this never changes).
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        );"
    )?;

    let version: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| r.get(0))
        .unwrap_or(0);

    if version < 1 {
        migrate_v1(conn)?;
    }

    // Future migrations go here:
    // if version < 2 { migrate_v2(conn)?; }
    // if version < 3 { migrate_v3(conn)?; }

    Ok(())
}

/// V1: Initial schema — notes, links, media_refs, annotations.
fn migrate_v1(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS notes (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'Untitled',
            content     TEXT NOT NULL DEFAULT '',
            tags        TEXT NOT NULL DEFAULT '[]',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS links (
            from_id     TEXT NOT NULL,
            to_id       TEXT NOT NULL,
            PRIMARY KEY (from_id, to_id),
            FOREIGN KEY (from_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (to_id)   REFERENCES notes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS media_refs (
            id          TEXT PRIMARY KEY,
            note_id     TEXT NOT NULL,
            media_type  TEXT NOT NULL,
            path        TEXT NOT NULL,
            meta        TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS annotations (
            id          TEXT PRIMARY KEY,
            note_id     TEXT NOT NULL,
            media_id    TEXT NOT NULL,
            kind        TEXT NOT NULL,
            position    TEXT NOT NULL,
            content     TEXT NOT NULL DEFAULT '',
            created_at  INTEGER NOT NULL,
            FOREIGN KEY (note_id)  REFERENCES notes(id)  ON DELETE CASCADE,
            FOREIGN KEY (media_id) REFERENCES media_refs(id) ON DELETE CASCADE
        );

        INSERT INTO schema_version (version) VALUES (1);
        ",
    )
}
