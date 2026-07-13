// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use rusqlite::{Connection, Result};

/// The ordered migration list. A `const` (not a local) so `run_migrations` and the
/// `#[cfg(test)] migrate_to` helper share one source of truth. Function items coerce
/// to `fn` pointers in const position.
const MIGRATIONS: &[(i32, fn(&Connection) -> Result<()>)] = &[
    (1, migrate_v1),
    (2, migrate_v2),
    (3, migrate_v3),
    (4, migrate_v4),
    (5, migrate_v5),
    (6, migrate_v6),
    (7, migrate_v7),
    (8, migrate_v8),
    (9, migrate_v9),
    (10, migrate_v10),
    (11, migrate_v11),
    (12, migrate_v12),
    (13, migrate_v13),
    (14, migrate_v14),
    (15, migrate_v15),
    (16, migrate_v16),
];

/// Stable id of the auto-seeded default vault (migrate_v14). Existing notes and
/// folders are backfilled into it, and the app never lets the user delete the
/// last remaining vault, so this row effectively always exists.
pub const DEFAULT_VAULT_ID: &str = "vault-default";

/// The newest schema version this build knows how to produce. Kept in sync with
/// `MIGRATIONS` via a `debug_assert` in `run_migrations`, and used by `init_db` to
/// decide whether an existing DB is about to be upgraded (and so should be
/// snapshotted first). Bump this when you add a `migrate_vN`.
pub const LATEST_VERSION: i32 = 16;

/// Run all pending migrations in order.
/// This is safe to call on every app launch — it only applies new migrations.
pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    // Ensure the version tracking table exists (this never changes).
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL
        );"
    )?;

    let version: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| r.get(0))
        .unwrap_or(0);

    // Each migration runs in its OWN transaction, so a failure (or crash/power
    // loss) can never leave a half-applied schema. Every migrate_vN ends with its
    // `INSERT INTO schema_version VALUES(N)`, so the DDL and the version bump
    // commit atomically — after an aborted run the whole batch is rolled back and
    // re-applied cleanly next launch, instead of a non-idempotent `ALTER TABLE`
    // tripping on a column that a partial run already added.
    //
    // Tripwire: if a new migrate_vN is added but LATEST_VERSION isn't bumped, the
    // pre-migration snapshot in init_db would silently skip the final step.
    debug_assert_eq!(MIGRATIONS.last().map(|(v, _)| *v).unwrap_or(0), LATEST_VERSION);

    for (v, migrate) in MIGRATIONS {
        if version < *v {
            let tx = conn.transaction()?;
            migrate(&tx)?;
            tx.commit()?;
        }
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

/// Test-only: bring a fresh connection up to exactly `target` schema version by
/// running the real migrations (each in its own transaction), so tests can build a
/// genuine "old install" fixture to migrate forward from.
#[cfg(test)]
pub(crate) fn migrate_to(conn: &mut Connection, target: i32) -> Result<()> {
    conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);")?;
    for (v, migrate) in MIGRATIONS {
        if *v <= target {
            let tx = conn.transaction()?;
            migrate(&tx)?;
            tx.commit()?;
        }
    }
    Ok(())
}

/// V1: Initial schema — notes, links, media_refs, annotations.
fn migrate_v1(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
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

/// V8: Workspaces — named groups that organize notes without separate vaults.
/// Notes stay global; membership is many-to-many (a note can be in several
/// workspaces). Collections are lightweight sub-groups inside a workspace. All
/// junctions cascade on note/workspace/collection delete, so removing a note from
/// a workspace only drops the association — it never deletes the note.
fn migrate_v8(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS workspaces (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            icon        TEXT NOT NULL DEFAULT '',
            color       TEXT,
            description TEXT NOT NULL DEFAULT '',
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS workspace_notes (
            workspace_id TEXT NOT NULL,
            note_id      TEXT NOT NULL,
            pinned       INTEGER NOT NULL DEFAULT 0,
            added_at     INTEGER NOT NULL,
            PRIMARY KEY (workspace_id, note_id),
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
            FOREIGN KEY (note_id)      REFERENCES notes(id)      ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS collections (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            name         TEXT NOT NULL,
            created_at   INTEGER NOT NULL,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS collection_notes (
            collection_id TEXT NOT NULL,
            note_id       TEXT NOT NULL,
            added_at      INTEGER NOT NULL,
            PRIMARY KEY (collection_id, note_id),
            FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE,
            FOREIGN KEY (note_id)       REFERENCES notes(id)       ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_workspace_notes_note ON workspace_notes(note_id);
        CREATE INDEX IF NOT EXISTS idx_collections_workspace ON collections(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_collection_notes_note ON collection_notes(note_id);

        INSERT INTO schema_version (version) VALUES (8);
        ",
    )
}

/// V9: Workspace canvases — a freeform, spatial board per workspace. The whole
/// board (nodes / edges / freehand drawings) is stored as one JSON document
/// (JSON-Canvas-compatible shape) in `data`. Multi-canvas-ready (a workspace can
/// hold several); cascades on workspace delete so a removed workspace drops its
/// canvases while its notes stay global.
fn migrate_v9(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS canvases (
            id           TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            title        TEXT NOT NULL DEFAULT 'Canvas',
            data         TEXT NOT NULL DEFAULT '{\"nodes\":[],\"edges\":[],\"drawings\":[]}',
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL,
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_canvases_workspace ON canvases(workspace_id);

        INSERT INTO schema_version (version) VALUES (9);
        ",
    )
}

/// V10: Link-preview cache — Open-Graph metadata for embedded web pages (the
/// `![webpage](url)` note embed + canvas link nodes), keyed by URL so a page's
/// card isn't re-fetched on every render.
fn migrate_v10(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS link_previews (
            url         TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            image       TEXT NOT NULL DEFAULT '',
            favicon     TEXT NOT NULL DEFAULT '',
            site_name   TEXT NOT NULL DEFAULT '',
            fetched_at  INTEGER NOT NULL
        );

        INSERT INTO schema_version (version) VALUES (10);
        ",
    )
}

/// V11: Theme Studio — token-level theming. `json` is the opaque theme object
/// (tokens/fonts/density/...) the frontend owns; Rust never parses it, the same
/// treatment as canvas `data` and conversation `messages`. Built-in presets and
/// the user's saved custom themes are rows with `is_builtin` distinguishing them;
/// the currently-active theme (which may be a hand-edited, unsaved variant) lives
/// in a sentinel row keyed by `__active__` so it persists across restarts without
/// polluting the saved-themes list.
fn migrate_v11(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS themes (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            json        TEXT NOT NULL,
            is_builtin  INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL
        );

        INSERT INTO schema_version (version) VALUES (11);
        ",
    )
}

/// V12: Per-note media layout — presentation metadata (width/alignment/caption)
/// for media embeds, kept OUT of the note's markdown (which stays the portable,
/// presentation-free source of truth). Keyed by `media_key` (asset URL + document-
/// order occurrence ordinal, computed by remarkJnana / the CM6 decoration walk) so
/// duplicate embeds of the same file get independent layout. `json` is opaque to
/// Rust — same treatment as canvas `data` / themes `json`. Its own table (not a
/// notes column) so resizing never touches `notes.updated_at` or triggers the
/// note-saved cascade (search re-index, link sync, etc.).
fn migrate_v12(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS note_media_layout (
            note_id     TEXT NOT NULL,
            media_key   TEXT NOT NULL,
            json        TEXT NOT NULL,
            PRIMARY KEY (note_id, media_key),
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        );

        INSERT INTO schema_version (version) VALUES (12);
        ",
    )
}

/// V13: Virtual folders — a single global folder tree that gives Obsidian
/// migrants the "vault" front door they expect, without any real filesystem
/// directories (virtual rows sidestep cross-platform path landmines: case
/// sensitivity, illegal chars, MAX_PATH, reserved names). Deliberately
/// SINGLE-parent — a note lives in exactly one folder (or is unfiled) — which is
/// what makes a folder feel like a folder. Hence a nullable `folder_id` COLUMN on
/// `notes`, not a junction table (junctions cover the "lives in many" need via
/// tags/collections/workspaces). Folders are an extra lens, never a container:
/// deleting a folder cascades its sub-folders but only SET NULLs its notes'
/// `folder_id` (they survive, unfiled) — the FK does this automatically under
/// `PRAGMA foreign_keys = ON`.
fn migrate_v13(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS folders (
            id          TEXT PRIMARY KEY,
            parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            position    INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        -- Nullable so existing notes are 'unfiled' (NULL); SET NULL keeps notes
        -- alive when their folder is deleted. Adding a column with a NULL-default
        -- FK reference is allowed by SQLite's ALTER TABLE ADD COLUMN.
        ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;

        INSERT INTO schema_version (version) VALUES (13);
        ",
    )
}

/// V14: Vaults — the Obsidian-style top-level container. Each note and folder
/// belongs to exactly one vault; the file explorer shows one active vault's tree
/// at a time. A single default vault is seeded and all pre-existing notes/folders
/// backfilled into it (so the upgrade is invisible until the user makes a second
/// vault). Deleting a vault cascades its folders; its notes are reassigned by the
/// `delete_vault` command before the row goes (the FK's SET NULL is only a
/// safety net — the app never orphans a note). `folder_id`'s vault must match the
/// note's vault, an invariant maintained by `set_note_folder`.
fn migrate_v14(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS vaults (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            position    INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL
        );

        -- Seed the default vault every existing note/folder folds into.
        INSERT INTO vaults (id, name, position, created_at, updated_at)
        VALUES ('vault-default', 'My Vault', 0,
                CAST(strftime('%s','now') AS INTEGER) * 1000,
                CAST(strftime('%s','now') AS INTEGER) * 1000);

        ALTER TABLE notes   ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE SET NULL;
        ALTER TABLE folders ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE CASCADE;

        UPDATE notes   SET vault_id = 'vault-default';
        UPDATE folders SET vault_id = 'vault-default';

        INSERT INTO schema_version (version) VALUES (14);
        ",
    )
}

/// V15: Vault-scope workspaces and AI projects. Both are now Obsidian-style
/// per-vault: a workspace/project belongs to one vault (like notes/folders), so
/// switching the active vault swaps which ones are shown. Backfilled into the
/// default vault. Cascades when a vault is deleted (its workspaces/projects — and
/// their junction rows — go with it), consistent with folders.
fn migrate_v15(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        ALTER TABLE workspaces  ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE CASCADE;
        ALTER TABLE ai_projects ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE CASCADE;

        UPDATE workspaces  SET vault_id = 'vault-default';
        UPDATE ai_projects SET vault_id = 'vault-default';

        INSERT INTO schema_version (version) VALUES (15);
        ",
    )
}

/// V16: Vault-scope AI conversations. Chat history is per-vault (like workspaces
/// / projects), so a new vault starts with an empty history instead of showing
/// another vault's chats. Backfilled into the default vault; cascades on vault
/// delete.
fn migrate_v16(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        ALTER TABLE conversations ADD COLUMN vault_id TEXT REFERENCES vaults(id) ON DELETE CASCADE;
        UPDATE conversations SET vault_id = 'vault-default';

        INSERT INTO schema_version (version) VALUES (16);
        ",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_run_migrations() {
        let mut conn = Connection::open_in_memory().unwrap();
        let result = run_migrations(&mut conn);
        assert!(result.is_ok());

        // Verify version is at LATEST_VERSION (currently 12 — the tripwire below
        // keeps LATEST_VERSION honest against the migrations list).
        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, LATEST_VERSION);
        assert_eq!(LATEST_VERSION, 16);

        // Verify tables exist
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").unwrap();
        let tables: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap().collect::<Result<_, _>>().unwrap();
        drop(stmt); // release the immutable borrow before re-running migrations below

        assert!(tables.contains(&"notes".to_string()));
        assert!(tables.contains(&"links".to_string()));
        assert!(tables.contains(&"embeddings".to_string()));
        assert!(tables.contains(&"conversations".to_string()));
        assert!(tables.contains(&"ai_presets".to_string()));
        assert!(tables.contains(&"ai_projects".to_string()));
        assert!(tables.contains(&"ai_project_knowledge".to_string()));
        assert!(tables.contains(&"note_progress".to_string()));
        assert!(tables.contains(&"workspaces".to_string()));
        assert!(tables.contains(&"workspace_notes".to_string()));
        assert!(tables.contains(&"collections".to_string()));
        assert!(tables.contains(&"collection_notes".to_string()));
        assert!(tables.contains(&"canvases".to_string()));
        assert!(tables.contains(&"link_previews".to_string()));
        assert!(tables.contains(&"themes".to_string()));
        assert!(tables.contains(&"note_media_layout".to_string()));
        assert!(tables.contains(&"folders".to_string()));
        assert!(tables.contains(&"vaults".to_string()));

        // Running again should be safe (idempotent)
        let result2 = run_migrations(&mut conn);
        assert!(result2.is_ok());
    }

    /// Simulate an old install stuck at v1, then upgrade the whole chain to
    /// LATEST_VERSION — the pre-existing note (and its favourite) must survive every
    /// step. Guards against a future migrate_vN dropping/rewriting existing data.
    #[test]
    fn test_migration_chain_from_v1_preserves_data() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("CREATE TABLE schema_version (version INTEGER NOT NULL);").unwrap();

        // Bring the DB up to v1 only, the way run_migrations would (its own tx).
        {
            let tx = conn.transaction().unwrap();
            migrate_v1(&tx).unwrap();
            tx.commit().unwrap();
        }
        let v1: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v1, 1);

        // Seed data into the v1 schema.
        conn.execute(
            "INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n1','Old Note','body',1,1)",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO favourites (note_id) VALUES ('n1')", []).unwrap();

        // Upgrade the rest of the way.
        run_migrations(&mut conn).unwrap();

        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, LATEST_VERSION);

        // The pre-existing note + favourite came through the full chain intact.
        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id='n1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "Old Note");
        let fav: i32 = conn
            .query_row("SELECT COUNT(*) FROM favourites WHERE note_id='n1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(fav, 1);
    }
}
