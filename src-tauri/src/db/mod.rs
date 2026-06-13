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

/// Create and initialize the database connection.
/// Called once at app startup — the returned connection is
/// shared via Tauri's managed state for the entire lifetime of the app.
pub fn init_db() -> Result<Connection> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir).ok();
    std::fs::create_dir_all(assets_dir()).ok();

    let conn = Connection::open(dir.join("jnana.db"))?;

    // Foreign keys are OFF by default in SQLite — enable them.
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    schema::run_migrations(&conn)?;

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
