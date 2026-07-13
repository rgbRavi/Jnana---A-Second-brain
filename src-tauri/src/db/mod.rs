// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

pub mod queries;
pub mod schema;

use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;

/// Type alias used everywhere for Tauri managed state.
pub type DbState = Mutex<Connection>;

pub fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("jnana")
}

pub fn assets_dir() -> PathBuf {
    data_dir().join("assets")
}

/// True when `name` is a plain asset filename that cannot escape `assets_dir()`.
/// Assets are stored flat under generated names, so a legitimate filename never
/// contains a path separator, a parent-dir segment, percent-encoding, or an
/// absolute path. Anything else is rejected outright.
pub fn is_safe_asset_filename(name: &str) -> bool {
    !name.is_empty()
        && name != ".."
        && !name.contains(['/', '\\', '%'])
        && !std::path::Path::new(name).is_absolute()
}

/// Resolve an asset filename to its on-disk path, guaranteeing the result lives
/// inside `assets_dir()`. Rejects unsafe names and (defense in depth) any path
/// that canonicalizes outside the assets directory.
pub fn safe_asset_file(name: &str) -> Result<PathBuf, String> {
    if !is_safe_asset_filename(name) {
        return Err(format!("Invalid asset filename: {}", name));
    }
    let path = assets_dir().join(name);

    // If the file exists, confirm its canonical path stays within assets_dir().
    // (A non-existent path can't be canonicalized; the name check above already
    // blocks traversal, so we allow it through for not-yet-written files.)
    if let Ok(resolved) = path.canonicalize() {
        let root = assets_dir()
            .canonicalize()
            .map_err(|e| format!("Failed to resolve assets dir: {}", e))?;
        if !resolved.starts_with(&root) {
            return Err(format!("Asset path escapes assets directory: {}", name));
        }
    }
    Ok(path)
}

/// True when `path` (an absolute OS path) resolves to a location inside
/// `assets_dir()`. Used to gate opening app-managed files externally.
pub fn is_within_assets(path: &std::path::Path) -> bool {
    match (path.canonicalize(), assets_dir().canonicalize()) {
        (Ok(resolved), Ok(root)) => resolved.starts_with(&root),
        _ => false,
    }
}

/// Swap in a backup staged by `restore_backup`, if one is pending. Runs once at
/// startup before the DB connection is opened, so we never replace the file under
/// a live connection (which Windows would lock). Best-effort: the staging dir and
/// marker are always cleared afterwards so a partial restore can't loop.
fn apply_pending_restore(dir: &std::path::Path) {
    let marker = dir.join(".restore_pending");
    if !marker.exists() {
        return;
    }

    log::info!("apply_pending_restore: restore marker found — applying staged backup");
    let staging = dir.join("restore_staging");
    let staged_db = staging.join("jnana.db");
    if staged_db.exists() {
        let main_db = dir.join("jnana.db");
        // Drop the old WAL/SHM side files so the restored db is authoritative.
        let _ = std::fs::remove_file(dir.join("jnana.db-wal"));
        let _ = std::fs::remove_file(dir.join("jnana.db-shm"));
        let db_copied = std::fs::copy(&staged_db, &main_db);
        match &db_copied {
            Ok(_) => log::info!("apply_pending_restore: database replaced from backup"),
            Err(e) => log::error!("apply_pending_restore: failed to replace database: {}", e),
        }
        if db_copied.is_ok() {
            // Replace assets only when the backup carried them.
            let staged_assets = staging.join("assets");
            if staged_assets.exists() {
                let assets = dir.join("assets");
                let _ = std::fs::remove_dir_all(&assets);
                let _ = std::fs::create_dir_all(&assets);
                let mut restored = 0usize;
                if let Ok(entries) = std::fs::read_dir(&staged_assets) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            if let Some(name) = p.file_name() {
                                if std::fs::copy(&p, assets.join(name)).is_ok() {
                                    restored += 1;
                                }
                            }
                        }
                    }
                }
                log::info!("apply_pending_restore: restored {} asset(s)", restored);
            }
        }
    } else {
        log::warn!("apply_pending_restore: marker present but no staged database found");
    }

    let _ = std::fs::remove_dir_all(&staging);
    let _ = std::fs::remove_file(&marker);
}

/// Create and initialize the database connection.
/// Called once at app startup — the returned connection is
/// shared via Tauri's managed state for the entire lifetime of the app.
pub fn init_db() -> Result<Connection> {
    init_db_at(&data_dir())
}

/// The real `init_db` body, parameterized on the data directory so the full
/// startup path (restore-swap → pre-migration snapshot → migrations) can be
/// exercised in tests against an isolated temp dir.
pub fn init_db_at(dir: &std::path::Path) -> Result<Connection> {
    std::fs::create_dir_all(dir).ok();
    std::fs::create_dir_all(dir.join("assets")).ok();

    // Apply a staged backup restore (from restore_backup) before opening the DB.
    apply_pending_restore(dir);

    let mut conn = Connection::open(dir.join("jnana.db"))?;

    // Enable WAL here (on the open connection, outside any transaction) — NOT inside
    // a migration. `journal_mode` cannot be changed while a transaction is active, and
    // run_migrations wraps every migrate_vN in its own transaction, so a fresh file DB
    // would otherwise fail at migrate_v1 with "cannot change into wal mode from within
    // a transaction". WAL is persisted in the DB header, so this is a no-op once set.
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;

    // Foreign keys are OFF by default in SQLite — enable them.
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // Snapshot an existing DB before any schema change. Each migrate_vN is already
    // transactional (so a failure rolls back cleanly), but a schema bump is still the
    // one moment data could be reshaped destructively — a raw pre-migration copy in
    // `backups/` is a cheap, always-recoverable safety net. Only when a populated DB
    // (version 1..LATEST) will actually be upgraded; a fresh DB is version 0 (its
    // schema_version table doesn't exist yet — the query falls back to 0).
    let current_version: i32 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |r| r.get(0))
        .unwrap_or(0);
    if current_version > 0 && current_version < schema::LATEST_VERSION {
        if let Err(e) = snapshot_pre_migration(&conn, dir, current_version) {
            // Non-fatal: log and continue. The transactional migrations still protect
            // the schema; the snapshot is defense in depth, not a launch prerequisite.
            log::warn!("init_db: pre-migration backup failed (continuing): {}", e);
        }
    }

    schema::run_migrations(&mut conn)?;

    Ok(conn)
}

/// Copy the live DB file into `backups/` before a version-bumping migration runs.
/// Folds the WAL into the main file first so the copy is a complete snapshot.
fn snapshot_pre_migration(
    conn: &Connection,
    dir: &std::path::Path,
    from_version: i32,
) -> Result<(), String> {
    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");

    let backups = dir.join("backups");
    std::fs::create_dir_all(&backups).map_err(|e| format!("create backups dir: {}", e))?;

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dest = backups.join(format!("pre-migration-v{}-{}.db", from_version, ts));
    std::fs::copy(dir.join("jnana.db"), &dest)
        .map_err(|e| format!("copy db: {}", e))?;

    log::info!(
        "snapshot_pre_migration: v{} DB copied → {}",
        from_version,
        dest.display()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_generated_filenames() {
        assert!(is_safe_asset_filename("abc.png"));
        assert!(is_safe_asset_filename("9f8e2a1b-uuid.mp4"));
        assert!(is_safe_asset_filename("noextension"));
    }

    #[test]
    fn rejects_traversal_separators_and_absolute() {
        for bad in ["", "..", "../etc/passwd", "a/b", "a\\b", "x%2e%2e", "/abs/path"] {
            assert!(!is_safe_asset_filename(bad), "should reject {:?}", bad);
        }
    }

    /// Drives the real startup path: an existing v11 DB (with a note) is snapshotted
    /// into `backups/` before being migrated up to LATEST_VERSION, and the note
    /// survives. Runs against an isolated temp dir, never the app's real data dir.
    #[test]
    fn init_db_at_snapshots_before_upgrading_an_old_db() {
        let scratch = std::env::temp_dir().join(format!("jnana-initdb-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&scratch).unwrap();

        // Plant a genuine v11 DB with a note, then close it.
        {
            let mut old = Connection::open(scratch.join("jnana.db")).unwrap();
            crate::db::schema::migrate_to(&mut old, 11).unwrap();
            old.execute(
                "INSERT INTO notes (id, title, content, created_at, updated_at) VALUES ('n1','Kept','body',1,1)",
                [],
            )
            .unwrap();
        }

        // Real startup path.
        let conn = init_db_at(&scratch).unwrap();

        // Migrated all the way up.
        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, schema::LATEST_VERSION);

        // The note survived the upgrade.
        let title: String = conn
            .query_row("SELECT title FROM notes WHERE id='n1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(title, "Kept");

        // A pre-migration snapshot of the v11 DB landed in backups/.
        let backups = scratch.join("backups");
        let snapshots: Vec<_> = std::fs::read_dir(&backups)
            .unwrap()
            .flatten()
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("pre-migration-v11-")
            })
            .collect();
        assert_eq!(snapshots.len(), 1, "expected exactly one v11 pre-migration snapshot");

        // The snapshot is a real, openable v11 DB (still at the pre-upgrade version).
        let snap = Connection::open(snapshots[0].path()).unwrap();
        let snap_version: i32 = snap
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(snap_version, 11);

        drop(conn);
        let _ = std::fs::remove_dir_all(&scratch);
    }

    /// A fresh (empty) data dir is version 0 → nothing to lose → no snapshot written.
    #[test]
    fn init_db_at_fresh_db_writes_no_snapshot() {
        let scratch = std::env::temp_dir().join(format!("jnana-initdb-{}", uuid::Uuid::new_v4()));

        let conn = init_db_at(&scratch).unwrap();
        let version: i32 = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(version, schema::LATEST_VERSION);

        let backups = scratch.join("backups");
        let snapshot_count = std::fs::read_dir(&backups).map(|it| it.count()).unwrap_or(0);
        assert_eq!(snapshot_count, 0, "a fresh DB should not be snapshotted");

        drop(conn);
        let _ = std::fs::remove_dir_all(&scratch);
    }
}
