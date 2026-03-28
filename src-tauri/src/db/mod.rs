pub mod schema;
pub mod queries;

use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub fn db_path() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("jnana")
}

pub fn get_connection() -> Result<Connection> {
    let dir = db_path();
    std::fs::create_dir_all(&dir).ok();
    Connection::open(dir.join("jnana.db"))
}