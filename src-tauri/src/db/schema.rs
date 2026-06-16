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

    if version < 2 {
        migrate_v2(conn)?;
    }

    if version < 3 {
        migrate_v3(conn)?;
    }

    if version < 4 {
        migrate_v4(conn)?;
    }

    if version < 5 {
        migrate_v5(conn)?;
    }

    if version < 6 {
        migrate_v6(conn)?;
    }

    if version < 7 {
        migrate_v7(conn)?;
    }

    let current: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| r.get(0))
        .unwrap_or(version);
    if current != version {
        log::info!("run_migrations: schema migrated v{} → v{}", version, current);
    } else {
        log::debug!("run_migrations: schema up to date (v{})", current);
    }

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

        CREATE TABLE IF NOT EXISTS favourites (
            note_id     TEXT PRIMARY KEY,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );

        INSERT INTO schema_version (version) VALUES (1);
        ",
    )
}

/// V2: Add favourites table (was missing from v1 for existing databases).
fn migrate_v2(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS favourites (
            note_id TEXT PRIMARY KEY,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );

        INSERT INTO schema_version (version) VALUES (2);
        ",
    )
}

/// V3: Local vector store for the AI/RAG layer.
///
/// Each note is split into chunks; every chunk gets an embedding vector
/// (produced by whichever AI provider the user configured). Vectors are
/// stored as a raw little-endian f32 BLOB plus their dimension, so cosine
/// search can be done entirely in Rust without a vector-DB dependency.
fn migrate_v3(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS embeddings (
            id          TEXT PRIMARY KEY,
            note_id     TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_text  TEXT NOT NULL,
            vector      BLOB NOT NULL,
            dim         INTEGER NOT NULL,
            model       TEXT NOT NULL,
            created_at  INTEGER NOT NULL,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_embeddings_note ON embeddings(note_id);

        INSERT INTO schema_version (version) VALUES (3);
        ",
    )
}

/// V4: AI chat conversations (history for both "Focused AI Assist" and "AI Chat").
///
/// One row per conversation. `messages` is a JSON array of the mode's message
/// union and `scope` is the focused-mode scope snapshot (null for free chat) —
/// stored as JSON columns, matching how `notes.tags` / annotation positions are
/// persisted. Plenty for personal scale; revisit only if a single conversation
/// grows large enough that rewriting the blob per turn is noticeable.
fn migrate_v4(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversations (
            id          TEXT PRIMARY KEY,
            mode        TEXT NOT NULL,
            title       TEXT NOT NULL DEFAULT 'New chat',
            messages    TEXT NOT NULL DEFAULT '[]',
            scope       TEXT,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_conversations_mode_updated
            ON conversations(mode, updated_at);

        INSERT INTO schema_version (version) VALUES (4);
        ",
    )
}

/// V5: AI presets — reusable response Styles and Skills (Claude-style).
///
/// Both are "a named instruction that augments the system prompt", so they share
/// one table keyed by `kind` ('style' | 'skill'). `body` holds the instruction
/// text. Projects (with their own knowledge base) get a separate later migration.
fn migrate_v5(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS ai_presets (
            id          TEXT PRIMARY KEY,
            kind        TEXT NOT NULL,
            name        TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            body        TEXT NOT NULL DEFAULT '',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_ai_presets_kind ON ai_presets(kind);

        INSERT INTO schema_version (version) VALUES (5);
        ",
    )
}

/// V6: AI Projects — a project carries custom instructions plus a knowledge base
/// (attached notes and uploaded files) that grounds every chat inside it.
/// Conversations gain a nullable `project_id` so chats can belong to a project.
fn migrate_v6(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS ai_projects (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            description  TEXT NOT NULL DEFAULT '',
            instructions TEXT NOT NULL DEFAULT '',
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_project_knowledge (
            id          TEXT PRIMARY KEY,
            project_id  TEXT NOT NULL,
            kind        TEXT NOT NULL,   -- 'note' | 'file'
            ref_id      TEXT NOT NULL,   -- note id, or asset filename
            label       TEXT NOT NULL DEFAULT '',
            created_at  INTEGER NOT NULL,
            FOREIGN KEY (project_id) REFERENCES ai_projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_project_knowledge_project ON ai_project_knowledge(project_id);

        ALTER TABLE conversations ADD COLUMN project_id TEXT;
        CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

        INSERT INTO schema_version (version) VALUES (6);
        ",
    )
}

/// V7: Dashboard data — media import timestamps (for "Recent imports"), a per-
/// project color, and a reading-progress table (for "Continue learning").
fn migrate_v7(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        ALTER TABLE media_refs ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0;
        UPDATE media_refs SET created_at = (CAST(strftime('%s','now') AS INTEGER) * 1000) WHERE created_at = 0;

        ALTER TABLE ai_projects ADD COLUMN color TEXT;

        CREATE TABLE IF NOT EXISTS note_progress (
            note_id    TEXT PRIMARY KEY,
            progress   REAL NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );

        INSERT INTO schema_version (version) VALUES (7);
        ",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_run_migrations() {
        let conn = Connection::open_in_memory().unwrap();
        let result = run_migrations(&conn);
        assert!(result.is_ok());

        // Verify version is 7
        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, 7);

        // Verify tables exist
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").unwrap();
        let tables: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();

        assert!(tables.contains(&"notes".to_string()));
        assert!(tables.contains(&"links".to_string()));
        assert!(tables.contains(&"embeddings".to_string()));
        assert!(tables.contains(&"conversations".to_string()));
        assert!(tables.contains(&"ai_presets".to_string()));
        assert!(tables.contains(&"ai_projects".to_string()));
        assert!(tables.contains(&"ai_project_knowledge".to_string()));
        assert!(tables.contains(&"note_progress".to_string()));

        // Running again should be safe (idempotent)
        let result2 = run_migrations(&conn);
        assert!(result2.is_ok());
    }
}
