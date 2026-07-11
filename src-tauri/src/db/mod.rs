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
fn apply_pending_restore() {
    let dir = data_dir();
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
                let assets = assets_dir();
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
    let dir = data_dir();
    std::fs::create_dir_all(&dir).ok();
    std::fs::create_dir_all(assets_dir()).ok();

    // Apply a staged backup restore (from restore_backup) before opening the DB.
    apply_pending_restore();

    let mut conn = Connection::open(dir.join("jnana.db"))?;

    // Foreign keys are OFF by default in SQLite — enable them.
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    schema::run_migrations(&mut conn)?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::is_safe_asset_filename;

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
}
