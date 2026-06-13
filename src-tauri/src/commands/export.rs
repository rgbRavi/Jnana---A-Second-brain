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

/// Write the given markdown files into `dir` and copy any referenced assets into
/// `dir/assets/`. `dir` is a user-chosen folder (from the directory picker).
/// File names are kept flat and asset names validated so export can't escape the
/// chosen directory or read outside the managed assets folder.
#[command]
pub fn export_notes(
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
        if f.name.is_empty() || f.name.contains(['/', '\\']) || f.name.contains("..") {
            continue;
        }
        fs::write(target.join(&f.name), &f.content)
            .map_err(|e| format!("Failed to write {}: {}", f.name, e))?;
        written += 1;
    }

    if !assets.is_empty() {
        let assets_out = target.join("assets");
        fs::create_dir_all(&assets_out)
            .map_err(|e| format!("Failed to create assets folder: {}", e))?;
        let src_dir = assets_dir();
        for a in &assets {
            // Only copy plain filenames straight out of our managed assets dir.
            if a.is_empty() || a.contains(['/', '\\', '%']) || a.contains("..") {
                continue;
            }
            let src = src_dir.join(a);
            if src.exists() {
                // Skip a missing/failed asset rather than failing the whole export.
                let _ = fs::copy(&src, assets_out.join(a));
            }
        }
    }

    Ok(written)
}
