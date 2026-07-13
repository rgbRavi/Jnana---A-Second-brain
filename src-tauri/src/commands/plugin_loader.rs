// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// The plugin loader runtime (Phase 1) — on-disk storage + install/remove/list of
// third-party plugins. Each plugin lives in `plugins_dir()/<id>/`, containing the
// author's files (a `manifest.json` + a built ESM entry) plus a `.install.json`
// with install metadata (granted permissions, source). The frontend reads the
// entry's *text* via `read_plugin_main` and imports it as a Blob module — so no
// custom URI scheme / asset-scope is needed to execute plugin code, only a
// `blob:` allowance in the CSP.
//
// Trust model: loading external code is gated by an install-time consent flow in
// the UI; the granted permission set is persisted here and handed back so the
// registry can build a capability-scoped context. This is deliberately simple
// (no sandbox) and appropriate while installs are user-initiated and local.

use crate::db::plugins_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::command;

/// The author-provided manifest (`manifest.json`). Unknown fields are ignored so
/// the format can grow without breaking older builds.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    /// Relative path (within the plugin folder) to the built ESM entry.
    pub main: String,
    #[serde(default)]
    pub min_app_version: String,
    /// Capabilities the plugin requests (e.g. "notes", "network").
    #[serde(default)]
    pub permissions: Vec<String>,
}

/// Install metadata persisted alongside the manifest (`.install.json`).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct InstallMeta {
    /// Permissions the user actually granted at install time.
    granted: Vec<String>,
    /// "zip" | "local".
    source: String,
    installed_at: i64,
}

/// What the frontend needs to list + load an installed plugin.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub main: String,
    pub min_app_version: String,
    pub permissions: Vec<String>,
    pub granted: Vec<String>,
    pub source: String,
}

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A plugin id must be a safe single path segment (it names a folder).
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 100
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && id != "."
        && id != ".."
}

/// Reject zip/local entry names that could escape the target dir.
fn safe_relative(name: &str) -> bool {
    !name.is_empty()
        && !name.contains("..")
        && !name.starts_with('/')
        && !name.starts_with('\\')
        && !name.contains(':')
}

fn parse_manifest(bytes: &[u8]) -> Result<PluginManifest, String> {
    let m: PluginManifest =
        serde_json::from_slice(bytes).map_err(|e| format!("Invalid manifest.json: {}", e))?;
    if !valid_id(&m.id) {
        return Err("Manifest id must use only letters, digits, - _ .".into());
    }
    if m.main.is_empty() || !safe_relative(&m.main) {
        return Err("Manifest 'main' must be a relative path inside the plugin.".into());
    }
    if m.name.trim().is_empty() {
        return Err("Manifest 'name' is required.".into());
    }
    Ok(m)
}

fn install_dir_for(id: &str) -> PathBuf {
    plugins_dir().join(id)
}

fn to_installed(m: PluginManifest, meta: InstallMeta) -> InstalledPlugin {
    InstalledPlugin {
        id: m.id,
        name: m.name,
        version: m.version,
        description: m.description,
        author: m.author,
        main: m.main,
        min_app_version: m.min_app_version,
        permissions: m.permissions,
        granted: meta.granted,
        source: meta.source,
    }
}

/// Read a plugin folder's manifest + install metadata.
fn read_installed(dir: &Path) -> Result<InstalledPlugin, String> {
    let manifest_bytes =
        fs::read(dir.join("manifest.json")).map_err(|e| format!("Missing manifest.json: {}", e))?;
    let manifest = parse_manifest(&manifest_bytes)?;
    let meta: InstallMeta = fs::read(dir.join(".install.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    Ok(to_installed(manifest, meta))
}

/// Peek a zip's manifest without extracting — so the UI can show the requested
/// permissions in the install-consent prompt before anything lands on disk.
#[command]
pub fn read_zip_manifest(zip_path: String) -> Result<PluginManifest, String> {
    let file = fs::File::open(&zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {}", e))?;
    let mut mf = archive
        .by_name("manifest.json")
        .map_err(|_| "Zip has no manifest.json at its root.".to_string())?;
    let mut buf = Vec::new();
    mf.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    parse_manifest(&buf)
}

/// Peek an unpacked folder's manifest (for Load Local Plugin consent).
#[command]
pub fn read_local_manifest(dir: String) -> Result<PluginManifest, String> {
    let bytes = fs::read(Path::new(&dir).join("manifest.json"))
        .map_err(|_| "Folder has no manifest.json.".to_string())?;
    parse_manifest(&bytes)
}

#[command]
pub fn list_installed_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let root = plugins_dir();
    if !root.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    let entries = fs::read_dir(&root).map_err(|e| format!("Failed to read plugins dir: {}", e))?;
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            match read_installed(&p) {
                Ok(info) => out.push(info),
                Err(e) => log::warn!("Skipping plugin at {}: {}", p.display(), e),
            }
        }
    }
    Ok(out)
}

/// Copy a directory tree into `dest`, rejecting unsafe entry paths.
fn copy_tree(src: &Path, dest: &Path) -> Result<(), String> {
    for entry in walkdir(src)? {
        let rel = entry
            .strip_prefix(src)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if !safe_relative(&rel) {
            continue;
        }
        let target = dest.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::copy(&entry, &target).map_err(|e| format!("Failed to copy {}: {}", rel, e))?;
        }
    }
    Ok(())
}

/// Minimal recursive file lister (avoids a walkdir dependency).
fn walkdir(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            let p = entry.path();
            if p.is_dir() {
                stack.push(p.clone());
            }
            out.push(p);
        }
    }
    Ok(out)
}

fn write_meta(dir: &Path, granted: Vec<String>, source: &str) -> Result<(), String> {
    let meta = InstallMeta {
        granted,
        source: source.to_string(),
        installed_at: now_ms(),
    };
    let json = serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(dir.join(".install.json"), json).map_err(|e| e.to_string())
}

/// Extract + register a plugin `.zip` (must contain `manifest.json` at its root)
/// into `plugins_dir()/<id>/`, replacing any existing install. Shared by the local
/// zip install and the catalog/URL install.
fn extract_and_register_zip(
    zip_path: &Path,
    granted: Vec<String>,
    source: &str,
) -> Result<InstalledPlugin, String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {}", e))?;

    // First pass: find + validate the manifest.
    let manifest = {
        let mut mf = archive
            .by_name("manifest.json")
            .map_err(|_| "Zip has no manifest.json at its root.".to_string())?;
        let mut buf = Vec::new();
        mf.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        parse_manifest(&buf)?
    };

    let dir = install_dir_for(&manifest.id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Failed to replace existing plugin: {}", e))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create plugin dir: {}", e))?;

    // Second pass: extract every safe entry. Normalize separators so a zip written
    // with backslashes (e.g. PowerShell Compress-Archive) is handled portably.
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if entry.is_dir() || !safe_relative(&name) {
            continue;
        }
        let target = dir.join(&name);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        fs::write(&target, &buf).map_err(|e| format!("Failed to write {}: {}", name, e))?;
    }

    // Confirm the declared entry actually landed.
    if !dir.join(&manifest.main).exists() {
        fs::remove_dir_all(&dir).ok();
        return Err(format!("Manifest 'main' ({}) is missing from the package.", manifest.main));
    }

    write_meta(&dir, granted.clone(), source)?;
    Ok(to_installed(manifest, InstallMeta { granted, source: source.into(), installed_at: now_ms() }))
}

/// Install a plugin from a local `.zip`.
#[command]
pub fn install_plugin_zip(zip_path: String, granted: Vec<String>) -> Result<InstalledPlugin, String> {
    extract_and_register_zip(Path::new(&zip_path), granted, "zip")
}

/// Install a plugin from an unpacked local folder (Developer → Load Local Plugin).
/// Copies it into `plugins_dir()` so it loads the same way as a zip install.
#[command]
pub fn install_local_plugin(dir: String, granted: Vec<String>) -> Result<InstalledPlugin, String> {
    let src = PathBuf::from(&dir);
    let manifest_bytes = fs::read(src.join("manifest.json"))
        .map_err(|_| "Folder has no manifest.json.".to_string())?;
    let manifest = parse_manifest(&manifest_bytes)?;
    if !src.join(&manifest.main).exists() {
        return Err(format!("Built entry '{}' not found — build the plugin first.", manifest.main));
    }

    let dest = install_dir_for(&manifest.id);
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| format!("Failed to replace existing plugin: {}", e))?;
    }
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    copy_tree(&src, &dest)?;
    write_meta(&dest, granted.clone(), "local")?;
    Ok(to_installed(manifest, InstallMeta { granted, source: "local".into(), installed_at: now_ms() }))
}

#[command]
pub fn remove_plugin(id: String) -> Result<(), String> {
    if !valid_id(&id) {
        return Err("Invalid plugin id.".into());
    }
    let dir = install_dir_for(&id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Failed to remove plugin: {}", e))?;
    }
    Ok(())
}

/// Read the text of a plugin's entry module, for Blob-URL import on the frontend.
#[command]
pub fn read_plugin_main(id: String) -> Result<String, String> {
    if !valid_id(&id) {
        return Err("Invalid plugin id.".into());
    }
    let dir = install_dir_for(&id);
    let manifest_bytes =
        fs::read(dir.join("manifest.json")).map_err(|e| format!("Missing manifest.json: {}", e))?;
    let manifest = parse_manifest(&manifest_bytes)?;
    if !safe_relative(&manifest.main) {
        return Err("Unsafe 'main' path.".into());
    }
    let main_path = dir.join(&manifest.main);
    // Ensure the resolved path stays inside the plugin dir.
    if !main_path.starts_with(&dir) {
        return Err("Entry path escapes the plugin folder.".into());
    }
    fs::read_to_string(&main_path).map_err(|e| format!("Failed to read plugin entry: {}", e))
}

/// Package a plugin source folder (which must contain `manifest.json` + its built
/// entry) into `dest_zip`, for distribution. Returns the zip path.
#[command]
pub fn package_plugin(src_dir: String, dest_zip: String) -> Result<String, String> {
    let src = PathBuf::from(&src_dir);
    let manifest_bytes = fs::read(src.join("manifest.json"))
        .map_err(|_| "Folder has no manifest.json.".to_string())?;
    let manifest = parse_manifest(&manifest_bytes)?;
    if !src.join(&manifest.main).exists() {
        return Err(format!("Built entry '{}' not found — build the plugin first.", manifest.main));
    }

    let file = fs::File::create(&dest_zip).map_err(|e| format!("Failed to create zip: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts: zip::write::SimpleFileOptions =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for entry in walkdir(&src)? {
        if entry.is_dir() {
            continue;
        }
        let rel = entry
            .strip_prefix(&src)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        if !safe_relative(&rel) || rel == ".install.json" {
            continue;
        }
        let bytes = fs::read(&entry).map_err(|e| e.to_string())?;
        use std::io::Write;
        zip.start_file(&rel, opts).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(dest_zip)
}

// ─── Remote catalog (Phase 2) ───────────────────────────

/// One plugin as listed in a community catalog index.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogEntry {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: String,
    /// Where the plugin's `.zip` package can be downloaded.
    pub download_url: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub min_app_version: String,
}

/// Fetch a catalog's bytes from an http(s) URL or a local file path (the latter
/// makes the whole flow testable offline).
async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    if url.starts_with("http://") || url.starts_with("https://") {
        let resp = reqwest::get(url)
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Request failed: HTTP {}", resp.status()));
        }
        Ok(resp.bytes().await.map_err(|e| e.to_string())?.to_vec())
    } else {
        let path = url.strip_prefix("file://").unwrap_or(url);
        fs::read(path).map_err(|e| format!("Failed to read {}: {}", path, e))
    }
}

/// Fetch + parse a plugin catalog. Accepts either `{ "plugins": [...] }` or a bare
/// array of entries.
#[command]
pub async fn fetch_plugin_catalog(url: String) -> Result<Vec<CatalogEntry>, String> {
    let bytes = fetch_bytes(&url).await?;
    #[derive(Deserialize)]
    struct Wrap {
        #[serde(default)]
        plugins: Vec<CatalogEntry>,
    }
    if let Ok(w) = serde_json::from_slice::<Wrap>(&bytes) {
        return Ok(w.plugins);
    }
    serde_json::from_slice::<Vec<CatalogEntry>>(&bytes)
        .map_err(|e| format!("Invalid catalog JSON: {}", e))
}

/// Download a plugin `.zip` from a URL (or local path) and install it.
#[command]
pub async fn install_from_url(
    download_url: String,
    granted: Vec<String>,
) -> Result<InstalledPlugin, String> {
    let bytes = fetch_bytes(&download_url).await?;
    let tmp = std::env::temp_dir().join(format!("jnana-plugin-{}.zip", uuid::Uuid::new_v4()));
    fs::write(&tmp, &bytes).map_err(|e| format!("Failed to buffer download: {}", e))?;
    let result = extract_and_register_zip(&tmp, granted, "catalog");
    let _ = fs::remove_file(&tmp);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_id_rejects_traversal_and_separators() {
        assert!(valid_id("my-plugin"));
        assert!(valid_id("com.acme.thing_1"));
        assert!(!valid_id(".."));
        assert!(!valid_id("a/b"));
        assert!(!valid_id("a\\b"));
        assert!(!valid_id(""));
    }

    #[test]
    fn safe_relative_blocks_escapes() {
        assert!(safe_relative("dist/main.js"));
        assert!(!safe_relative("../evil.js"));
        assert!(!safe_relative("/etc/passwd"));
        assert!(!safe_relative("C:\\x"));
    }

    #[test]
    fn parse_manifest_validates_required_fields() {
        let good = br#"{"id":"acme","name":"Acme","version":"1.0.0","main":"dist/main.js"}"#;
        let m = parse_manifest(good).unwrap();
        assert_eq!(m.id, "acme");
        assert_eq!(m.main, "dist/main.js");

        let bad_id = br#"{"id":"../x","name":"X","version":"1","main":"m.js"}"#;
        assert!(parse_manifest(bad_id).is_err());

        let bad_main = br#"{"id":"x","name":"X","version":"1","main":"../m.js"}"#;
        assert!(parse_manifest(bad_main).is_err());

        let unknown_ok = br#"{"id":"x","name":"X","version":"1","main":"m.js","contributes":{"noteTypes":["a"]},"future":42}"#;
        assert!(parse_manifest(unknown_ok).is_ok());
    }
}
