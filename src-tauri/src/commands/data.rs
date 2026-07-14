// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// Import / Export / Backup commands for the Settings → "Import / Export" panel.
//
// Backups are file-based (a .zip of a consistent SQLite copy + the assets folder)
// so there's no schema change. Restore can't replace the live DB in place (the
// connection is held open in managed state — unsafe on Windows), so it stages the
// files and a marker; db::init_db() swaps them in on the next launch.

use crate::commands::notes::{Note, NoteRow};
use crate::db::{assets_dir, data_dir, queries, DbState};
use serde::Serialize;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use zip::write::SimpleFileOptions;

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn db_path() -> PathBuf {
    data_dir().join("jnana.db")
}

/// (file count, total bytes) of the flat files directly inside `dir`.
fn dir_size(dir: &Path) -> (u64, u64) {
    let mut count = 0u64;
    let mut bytes = 0u64;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    count += 1;
                    bytes += meta.len();
                }
            }
        }
    }
    (count, bytes)
}

// ─── Storage statistics ─────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageStats {
    pub note_count: i64,
    pub conversation_count: i64,
    pub asset_count: u64,
    pub asset_bytes: u64,
    pub db_bytes: u64,
}

#[command]
pub fn get_storage_stats(state: State<'_, DbState>) -> Result<StorageStats, String> {
    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let note_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
        .map_err(|e| format!("Failed to count notes: {}", e))?;
    let conversation_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0))
        .unwrap_or(0);
    let (asset_count, asset_bytes) = dir_size(&assets_dir());
    let db_bytes = fs::metadata(db_path()).map(|m| m.len()).unwrap_or(0);
    Ok(StorageStats {
        note_count,
        conversation_count,
        asset_count,
        asset_bytes,
        db_bytes,
    })
}

// ─── Export assets ──────────────────────────────────────────────────────────

/// Copy every managed asset file into `dir/assets/`. Returns the number copied.
/// Async + spawn_blocking so the (potentially large) file IO never blocks the UI
/// thread that Tauri runs synchronous commands on.
#[command]
pub async fn export_assets(dir: String) -> Result<usize, String> {
    let target = PathBuf::from(dir);
    if !target.is_dir() {
        return Err(format!("Not a directory: {}", target.display()));
    }
    let src = assets_dir();

    tauri::async_runtime::spawn_blocking(move || -> Result<usize, String> {
        let out = target.join("assets");
        fs::create_dir_all(&out).map_err(|e| format!("Failed to create assets folder: {}", e))?;
        let mut copied = 0usize;
        if let Ok(entries) = fs::read_dir(&src) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(name) = p.file_name() {
                        if fs::copy(&p, out.join(name)).is_ok() {
                            copied += 1;
                        }
                    }
                }
            }
        }
        log::info!("export_assets: copied {} file(s) to {}", copied, out.display());
        Ok(copied)
    })
    .await
    .map_err(|e| format!("Export task failed: {}", e))?
}

// ─── Backup (SQLite copy + assets, zipped) ──────────────────────────────────

/// Write a backup zip at `zip_path`: `db_bytes` as `jnana.db` (deflated), plus every
/// flat file in `assets_src` stored (uncompressed) under `assets/`. Extracted from
/// `create_backup` so the round-trip is unit-testable over explicit paths.
fn write_backup_zip(zip_path: &Path, db_bytes: &[u8], assets_src: &Path) -> Result<(), String> {
    let file = fs::File::create(zip_path).map_err(|e| format!("Failed to create backup file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let db_opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let store_opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);

    zip.start_file("jnana.db", db_opts).map_err(|e| e.to_string())?;
    zip.write_all(db_bytes).map_err(|e| e.to_string())?;

    if let Ok(entries) = fs::read_dir(assets_src) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let Some(name) = p.file_name().and_then(|n| n.to_str()) else { continue };
            let Ok(mut f) = fs::File::open(&p) else { continue };
            zip.start_file(format!("assets/{}", name), store_opts)
                .map_err(|e| e.to_string())?;
            // Stream the file straight into the archive (no full read into memory).
            std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Extract a backup zip into `staging`: `jnana.db` at the root and each `assets/<file>`
/// into `staging/assets/`, rejecting any traversal / nested / absolute entry name.
/// Returns `Ok(true)` when a `jnana.db` member was found and staged. Extracted from
/// `restore_backup` so the round-trip is unit-testable over explicit paths.
fn extract_backup_zip(zip_path: &Path, staging: &Path) -> Result<bool, String> {
    fs::create_dir_all(staging).map_err(|e| format!("Failed to create staging dir: {}", e))?;

    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open backup: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid backup zip: {}", e))?;

    let mut has_db = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.contains("..") || name.starts_with('/') || name.starts_with('\\') {
            continue;
        }

        let out_path = if name == "jnana.db" {
            has_db = true;
            staging.join("jnana.db")
        } else if let Some(asset) = name.strip_prefix("assets/") {
            if asset.is_empty() || asset.contains('/') || asset.contains('\\') {
                continue;
            }
            let adir = staging.join("assets");
            fs::create_dir_all(&adir).map_err(|e| e.to_string())?;
            adir.join(asset)
        } else {
            continue;
        };

        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::write(&out_path, &buf).map_err(|e| format!("Failed to stage {}: {}", name, e))?;
    }

    Ok(has_db)
}

/// Write a backup `.zip` (a consistent DB snapshot + the assets folder). When
/// `dest_dir` is given it's the "Export Full Vault" target; otherwise the backup
/// lands in the app's default `backups/` dir ("Create Backup"). Returns the path.
///
/// Async + spawn_blocking: Tauri runs sync commands on the UI thread, so zipping
/// would freeze the app. Assets (already-compressed media) are *stored* rather
/// than re-deflated — that's both far faster (especially in debug builds) and
/// avoids wasting CPU; only the small DB is compressed.
#[command]
pub async fn create_backup(state: State<'_, DbState>, dest_dir: Option<String>) -> Result<String, String> {
    let out_dir = match &dest_dir {
        Some(d) => PathBuf::from(d),
        None => {
            let backups = data_dir().join("backups");
            fs::create_dir_all(&backups).map_err(|e| format!("Failed to create backups dir: {}", e))?;
            backups
        }
    };
    if !out_dir.is_dir() {
        return Err(format!("Not a directory: {}", out_dir.display()));
    }

    let zip_path = out_dir.join(format!("jnana-backup-{}.zip", now_ms()));
    log::info!("create_backup: starting → {}", zip_path.display());

    // Consistent DB snapshot: fold the WAL into the main file, then read its bytes
    // while still holding the lock so no writes can interleave. Fast (no compression
    // here), so doing it on this thread before offloading the zip work is fine.
    let db_bytes = {
        let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        fs::read(db_path()).map_err(|e| format!("Failed to read database: {}", e))?
    };

    let assets = assets_dir();
    let zp = zip_path.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        write_backup_zip(&zp, &db_bytes, &assets)
    })
    .await
    .map_err(|e| format!("Backup task failed: {}", e))?;

    if let Err(ref e) = result {
        log::error!("create_backup failed: {}", e);
    }
    result?;

    log::info!("create_backup: wrote {}", zip_path.display());
    Ok(zip_path.to_string_lossy().to_string())
}

/// Stage a backup for restore. The actual swap happens at next launch (see
/// db::init_db) because the live connection can't be replaced under us. Async +
/// spawn_blocking so unzipping doesn't freeze the UI thread.
#[command]
pub async fn restore_backup(zip_path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        log::info!("restore_backup: staging from {}", zip_path);
        let zp = Path::new(&zip_path);
        if !zp.is_file() {
            return Err(format!("Not a file: {}", zip_path));
        }

        let staging = data_dir().join("restore_staging");
        let _ = fs::remove_dir_all(&staging);

        let has_db = extract_backup_zip(zp, &staging)?;
        if !has_db {
            let _ = fs::remove_dir_all(&staging);
            log::error!("restore_backup: backup is missing jnana.db");
            return Err("Backup is missing jnana.db".into());
        }

        fs::write(data_dir().join(".restore_pending"), b"1")
            .map_err(|e| format!("Failed to write restore marker: {}", e))?;
        log::info!("restore_backup: staged — will be applied on next launch");
        Ok(())
    })
    .await
    .map_err(|e| format!("Restore task failed: {}", e))?
}

// ─── Import markdown folder ─────────────────────────────────────────────────

/// First `# heading` line in markdown, if any (used as the imported note's title).
fn first_heading(content: &str) -> Option<String> {
    for line in content.lines() {
        let t = line.trim();
        if let Some(h) = t.strip_prefix("# ") {
            let h = h.trim();
            if !h.is_empty() {
                return Some(h.to_string());
            }
        }
    }
    None
}

/// Import every `.md` / `.markdown` file in `dir` as a new note. Title is the
/// first heading or the filename stem. Returns the created notes.
#[command]
pub fn import_markdown_dir(state: State<'_, DbState>, dir: String) -> Result<Vec<Note>, String> {
    let path = Path::new(&dir);
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }

    let conn = state.lock().map_err(|e| format!("DB lock error: {}", e))?;
    let mut created: Vec<Note> = Vec::new();

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let is_md = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("md") || e.eq_ignore_ascii_case("markdown"))
                .unwrap_or(false);
            if !is_md {
                continue;
            }

            let Ok(content) = fs::read_to_string(&p) else { continue };
            let stem = p
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();
            let title = first_heading(&content).unwrap_or(stem);
            let ts = now_ms();
            let id = uuid::Uuid::new_v4().to_string();

            let row = NoteRow {
                id: id.clone(),
                title: title.clone(),
                content: content.clone(),
                tags: "[]".to_string(),
                created_at: ts,
                updated_at: ts,
                folder_id: None,
                vault_id: Some(crate::db::schema::DEFAULT_VAULT_ID.to_string()),
                kind: None,
            };
            queries::insert_or_update_note(&conn, &row)
                .map_err(|e| format!("Failed to import {}: {}", p.display(), e))?;

            created.push(Note {
                id,
                title,
                content,
                tags: Vec::new(),
                created_at: ts,
                updated_at: ts,
                folder_id: None,
                vault_id: Some(crate::db::schema::DEFAULT_VAULT_ID.to_string()),
                kind: None,
            });
        }
    }

    log::info!("import_markdown_dir: imported {} note(s) from {}", created.len(), dir);
    Ok(created)
}

// ─── Diagnostics ────────────────────────────────────────────────────────────

/// Reveal the log directory (where tauri-plugin-log writes jnana.log) in the OS
/// file manager, via the existing opener plugin.
#[command]
pub fn open_logs_dir(app: AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Could not resolve log directory: {}", e))?;
    fs::create_dir_all(&dir).ok();
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| format!("Failed to open logs directory: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_scratch() -> PathBuf {
        let d = std::env::temp_dir().join(format!("jnana-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// A backup written by `write_backup_zip` restores byte-for-byte through
    /// `extract_backup_zip` — the DB snapshot and every asset survive the round trip.
    #[test]
    fn backup_zip_round_trips_db_and_assets() {
        let scratch = temp_scratch();
        let src_assets = scratch.join("assets");
        fs::create_dir_all(&src_assets).unwrap();
        fs::write(src_assets.join("pic.png"), b"PNGDATA").unwrap();
        fs::write(src_assets.join("clip.mp4"), b"MP4DATA").unwrap();

        let db_bytes: &[u8] = b"SQLITE-DB-BYTES";
        let zip_path = scratch.join("backup.zip");
        write_backup_zip(&zip_path, db_bytes, &src_assets).unwrap();
        assert!(zip_path.is_file());

        let staging = scratch.join("staging");
        let has_db = extract_backup_zip(&zip_path, &staging).unwrap();
        assert!(has_db);

        assert_eq!(fs::read(staging.join("jnana.db")).unwrap(), db_bytes.to_vec());
        assert_eq!(fs::read(staging.join("assets/pic.png")).unwrap(), b"PNGDATA".to_vec());
        assert_eq!(fs::read(staging.join("assets/clip.mp4")).unwrap(), b"MP4DATA".to_vec());

        let _ = fs::remove_dir_all(&scratch);
    }

    /// Restoring an archive with no `jnana.db` member reports `false` (the command
    /// turns this into a "Backup is missing jnana.db" error rather than a bad swap).
    #[test]
    fn extract_reports_missing_db() {
        let scratch = temp_scratch();
        // Build a zip carrying only an asset, no jnana.db, by writing directly.
        let zip_path = scratch.join("no-db.zip");
        {
            let file = fs::File::create(&zip_path).unwrap();
            let mut zip = zip::ZipWriter::new(file);
            let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            zip.start_file("assets/pic.png", opts).unwrap();
            zip.write_all(b"PNGDATA").unwrap();
            zip.finish().unwrap();
        }

        let staging = scratch.join("staging");
        let has_db = extract_backup_zip(&zip_path, &staging).unwrap();
        assert!(!has_db);
        // The asset still extracted, but the caller rejects the restore on !has_db.
        assert!(staging.join("assets/pic.png").is_file());

        let _ = fs::remove_dir_all(&scratch);
    }
}
