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
