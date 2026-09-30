// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

use crate::db::assets_dir;
use serde::Deserialize;
use std::fs;
use std::path::Path;
use tauri::command;

/// One markdown file to write during export.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub name: String,
    pub content: String,
}

/// A plain file name that stays inside the target directory. Dots inside a name
/// ("Wait... what.md") are fine; separators, a drive prefix (`C:x`) and bare
/// `.`/`..` are what could escape.
fn is_flat_name(name: &str) -> bool {
    !name.is_empty() && name != "." && name != ".." && !name.contains(['/', '\\', ':'])
}

/// Copy referenced assets from `src_dir` into `out`. Asset names are UUIDs and
/// never rewritten, so one already present is skipped: a live mirror re-exports
/// on every save and must not re-copy a video each time.
fn copy_assets(src_dir: &Path, out: &Path, assets: &[String]) -> Result<(), String> {
    fs::create_dir_all(out).map_err(|e| format!("Failed to create assets folder: {}", e))?;
    for a in assets {
        // Only copy plain filenames straight out of our managed assets dir.
        if a.is_empty() || a.contains(['/', '\\', '%']) || a.contains("..") {
            continue;
        }
        let src = src_dir.join(a);
        let dest = out.join(a);
        if src.exists() && !dest.exists() {
            // Skip a missing/failed asset rather than failing the whole export.
            let _ = fs::copy(&src, &dest);
        }
    }
    Ok(())
}

fn remove_md_files(target: &Path, names: &[String]) -> Result<usize, String> {
    if !target.is_dir() {
        return Err(format!("Not a directory: {}", target.display()));
    }
    let mut removed = 0usize;
    for n in names {
        if !is_flat_name(n) || !n.to_ascii_lowercase().ends_with(".md") {
            continue;
        }
        match fs::remove_file(target.join(n)) {
            Ok(()) => removed += 1,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("Failed to remove {}: {}", n, e)),
        }
    }
    Ok(removed)
}

/// Write the given markdown files into `dir` and copy any referenced assets into
/// `dir/assets/`. `dir` is a user-chosen folder (from the directory picker).
/// File names are kept flat and asset names validated so export can't escape the
/// chosen directory or read outside the managed assets folder.
#[command]
pub async fn export_notes(
    dir: String,
    files: Vec<ExportFile>,
    assets: Vec<String>,
) -> Result<usize, String> {
    let target = Path::new(&dir);
    if !target.is_dir() {
        return Err(format!("Not a directory: {}", dir));
    }

    let mut written = 0usize;
    for f in &files {
        if !is_flat_name(&f.name) {
            continue;
        }
        fs::write(target.join(&f.name), &f.content)
            .map_err(|e| format!("Failed to write {}: {}", f.name, e))?;
        written += 1;
    }

    if !assets.is_empty() {
        copy_assets(&assets_dir(), &target.join("assets"), &assets)?;
    }

    Ok(written)
}

/// Delete files a live Markdown mirror previously wrote into `dir`. Only flat
/// `.md` names: the mirror never removes anything else (assets, the user's own
/// files), and a file that's already gone is not an error.
#[command]
pub async fn remove_export_files(dir: String, names: Vec<String>) -> Result<usize, String> {
    remove_md_files(Path::new(&dir), &names)
}

/// Write UTF-8 text to a user-chosen absolute path (from the native save dialog).
/// The path is picked by the OS "Save As" dialog, so it is already user-authorised;
/// we only forward the bytes.
#[command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

/// Write raw bytes to a user-chosen absolute path (from the native save dialog).
/// Used for binary exports like a canvas PNG. Same authorisation model as
/// `write_text_file` — the OS dialog already picked the path.
#[command]
pub fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(&path, bytes).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn scratch() -> PathBuf {
        let d = std::env::temp_dir().join(format!("jnana-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&d).unwrap();
        d
    }

    /// A live mirror re-exports on every autosave; an asset already in the
    /// mirror (UUID-named, never rewritten) must not be copied again.
    #[test]
    fn copy_assets_skips_existing_destination() {
        let s = scratch();
        let src = s.join("src");
        let out = s.join("out");
        fs::create_dir_all(&src).unwrap();
        fs::create_dir_all(&out).unwrap();
        fs::write(src.join("a.png"), b"NEW").unwrap();
        fs::write(out.join("a.png"), b"OLD").unwrap();
        fs::write(src.join("b.png"), b"B").unwrap();

        copy_assets(&src, &out, &["a.png".into(), "b.png".into(), "../b.png".into()]).unwrap();

        assert_eq!(fs::read(out.join("a.png")).unwrap(), b"OLD");
        assert_eq!(fs::read(out.join("b.png")).unwrap(), b"B");
    }

    /// Titles with an ellipsis or a trailing dot are ordinary file names; only
    /// separators, drive prefixes and bare `.`/`..` could leave the folder.
    #[test]
    fn flat_names_allow_dots_but_not_escapes() {
        assert!(is_flat_name("Wait... what.md"));
        assert!(is_flat_name("Chapter 1..md"));
        for bad in ["", ".", "..", "a/b.md", "a\\b.md", "C:x.md"] {
            assert!(!is_flat_name(bad), "{bad:?} should be rejected");
        }
    }

    /// Only flat `.md` names inside the target are removed; a missing file is fine.
    #[test]
    fn remove_md_files_only_removes_flat_md_names() {
        let s = scratch();
        let target = s.join("mirror");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("Note.md"), "x").unwrap();
        fs::write(target.join("photo.png"), "x").unwrap();
        fs::write(s.join("escape.md"), "x").unwrap();

        let removed = remove_md_files(
            &target,
            &["../escape.md".into(), "photo.png".into(), "Note.md".into(), "gone.md".into()],
        )
        .unwrap();

        assert_eq!(removed, 1);
        assert!(!target.join("Note.md").exists());
        assert!(target.join("photo.png").exists());
        assert!(s.join("escape.md").exists());
    }
}
