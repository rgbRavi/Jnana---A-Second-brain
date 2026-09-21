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
// Trust model: loading external code is gated by an install-time consent flow.
// The frontend can only *preview* a package (`read_zip_manifest` /
// `read_local_manifest` / `preview_plugin_download`); each preview mints a
// one-shot `consentToken` bound to that exact package, and `install_plugin`
// installs only what a live token points at, granting only the permissions that
// package's own manifest declared. So no caller can hand itself an arbitrary
// permission set, and the package installed is the package the user was shown.
// There is still no sandbox — plugin code runs on the main thread with the
// webview's full IPC reach — so this bounds the *recorded* grant, not what
// hostile code could attempt; that needs the worker path.

use crate::db::{plugins_dir, safe_asset_file};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
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
    /// "worker" runs the plugin in a Web Worker (isolated, no DOM); empty or
    /// "main" keeps it on the main thread, which is what a plugin that renders
    /// note types or widgets needs.
    #[serde(default)]
    pub runtime: String,
    /// Hosts the plugin may reach with the `network` permission, e.g.
    /// ["api.example.com", "*.tiles.example.org"]. Requests anywhere else are
    /// refused — the permission alone grants nothing.
    #[serde(default)]
    pub hosts: Vec<String>,
    /// Where the plugin's source / project page lives, shown before installing.
    #[serde(default)]
    pub homepage: String,
    /// "theme" or "utility" (default). A **label**, not a capability gate: it
    /// groups the plugin in Settings and lets the consent prompt point out a
    /// theme that also wants to read your notes. Nothing is enforced from it,
    /// because a plugin's capabilities come from its permissions.
    #[serde(default, rename = "type")]
    pub plugin_type: String,
}

/// Install metadata persisted alongside the manifest (`.install.json`).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct InstallMeta {
    /// Permissions the user actually granted at install time.
    granted: Vec<String>,
    /// Hosts the user approved (the manifest's `hosts`, kept only when `network`
    /// was granted). `plugin_fetch` refuses anything not in here.
    #[serde(default)]
    hosts: Vec<String>,
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
    /// Hosts approved at install (empty unless `network` was granted).
    pub hosts: Vec<String>,
    pub source: String,
    pub runtime: String,
    pub homepage: String,
    /// "theme" | "utility" (empty means utility).
    #[serde(rename = "type")]
    pub plugin_type: String,
    /// When this plugin was installed (epoch ms) — the Installed list sorts on it.
    pub installed_at: i64,
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
    if !matches!(m.runtime.as_str(), "" | "main" | "worker") {
        return Err("Manifest 'runtime' must be \"main\" or \"worker\".".into());
    }
    if !matches!(m.plugin_type.as_str(), "" | "theme" | "utility") {
        return Err("Manifest 'type' must be \"theme\" or \"utility\".".into());
    }
    if !m.homepage.is_empty() && !m.homepage.starts_with("https://") {
        return Err("Manifest 'homepage' must be an https:// URL.".into());
    }
    for h in &m.hosts {
        if !valid_host_pattern(h) {
            return Err(format!(
                "Manifest host '{}' must be a bare hostname such as api.example.com or *.example.com.",
                h
            ));
        }
    }
    Ok(m)
}

/// A declared host is a bare hostname, optionally with a leading `*.` label.
/// No scheme, port or path — those would suggest a precision the check doesn't
/// have, and a plugin declaring "example.com/safe" would be nonsense.
fn valid_host_pattern(h: &str) -> bool {
    let body = h.strip_prefix("*.").unwrap_or(h);
    !body.is_empty()
        && body.len() <= 253
        && body.contains('.')
        && !body.starts_with('.')
        && !body.ends_with('.')
        && body
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.')
}

/// True when `host` is covered by one of the approved patterns. `*.example.com`
/// covers `example.com` and any subdomain of it; a bare pattern is exact.
fn host_allowed(allowed: &[String], host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    allowed.iter().any(|pattern| {
        let pattern = pattern.trim().to_ascii_lowercase();
        match pattern.strip_prefix("*.") {
            Some(base) => host == base || host.ends_with(&format!(".{}", base)),
            None => host == pattern,
        }
    })
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
        hosts: meta.hosts,
        source: meta.source,
        runtime: if m.runtime.is_empty() { "main".into() } else { m.runtime },
        homepage: m.homepage,
        plugin_type: if m.plugin_type.is_empty() { "utility".into() } else { m.plugin_type },
        installed_at: meta.installed_at,
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

// ─── Install consent ────────────────────────────────────

/// Permissions the app knows how to present. Anything else a manifest declares is
/// dropped rather than silently granted (only `notes` is actually enforced — see
/// `pluginRegistry`).
const KNOWN_PERMISSIONS: [&str; 3] = ["notes", "network", "media"];

/// A consent token is good for ten minutes and exactly one install.
const CONSENT_TTL_MS: i64 = 10 * 60 * 1000;

/// Ceilings for anything we unpack or download. A plugin bundle is a few hundred
/// KB; these exist so a hostile package can't exhaust memory or disk before its
/// manifest is even read (a zip bomb is a handful of KB on the wire).
const MAX_PACKAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_PACKAGE_ENTRIES: usize = 1000;

/// This build's version, for `minAppVersion`.
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// True when numeric-dot version `a` is strictly newer than `b`; non-numeric parts
/// count as 0, mirroring `isNewerVersion` on the frontend.
fn is_newer(a: &str, b: &str) -> bool {
    let part = |v: &str, i: usize| -> u32 {
        v.split('.').nth(i).and_then(|p| p.parse().ok()).unwrap_or(0)
    };
    let len = a.split('.').count().max(b.split('.').count());
    for i in 0..len {
        let (x, y) = (part(a, i), part(b, i));
        if x != y {
            return x > y;
        }
    }
    false
}

/// Refuse a package that needs a newer Jnana than this one. Without this the
/// plugin installs happily and then dies mid-render against an API that isn't
/// there — a stack trace in the console instead of a sentence at install time.
fn check_app_version(m: &PluginManifest) -> Result<(), String> {
    if !m.min_app_version.is_empty() && is_newer(&m.min_app_version, APP_VERSION) {
        return Err(format!(
            "{} needs Jnana {} or newer (this is {}).",
            m.name, m.min_app_version, APP_VERSION
        ));
    }
    Ok(())
}

/// Where a previewed package is waiting.
#[derive(Debug, Clone)]
enum ConsentSource {
    /// A `.zip` on disk — one the user picked, or a buffered download (`temp`).
    Zip(PathBuf),
    /// An unpacked folder (Developer → Load Local Plugin).
    Folder(PathBuf),
}

/// A package the user has been shown, awaiting their decision. The permission set
/// is read from *that package's own manifest* at preview time and never from a
/// caller, so an install can only grant what the previewed package declared.
#[derive(Debug)]
struct PendingConsent {
    plugin_id: String,
    permissions: Vec<String>,
    /// The manifest's `hosts`, kept only if it asked for `network`.
    hosts: Vec<String>,
    source: ConsentSource,
    /// True when we own the file and must delete it after installing.
    temp: bool,
    issued_at: i64,
}

fn pending() -> &'static Mutex<HashMap<String, PendingConsent>> {
    static PENDING: OnceLock<Mutex<HashMap<String, PendingConsent>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Delete a consent's buffered download, if it owned one.
fn drop_temp(c: &PendingConsent) {
    if c.temp {
        if let ConsentSource::Zip(p) = &c.source {
            let _ = fs::remove_file(p);
        }
    }
}

/// Register a previewed package and mint its one-shot token. Expired entries (and
/// their buffered downloads) are swept on the way in.
fn issue_consent(manifest: &PluginManifest, source: ConsentSource, temp: bool) -> String {
    let token = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let mut map = pending().lock().unwrap_or_else(|e| e.into_inner());
    map.retain(|_, c| {
        let live = now - c.issued_at < CONSENT_TTL_MS;
        if !live {
            drop_temp(c);
        }
        live
    });
    let permissions: Vec<String> = manifest
        .permissions
        .iter()
        .filter(|p| KNOWN_PERMISSIONS.contains(&p.as_str()))
        .cloned()
        .collect();
    // Hosts are meaningless without the permission, so they're dropped with it.
    let hosts = if permissions.iter().any(|p| p == "network") {
        manifest.hosts.clone()
    } else {
        Vec::new()
    };
    map.insert(
        token.clone(),
        PendingConsent {
            plugin_id: manifest.id.clone(),
            permissions,
            hosts,
            source,
            temp,
            issued_at: now,
        },
    );
    token
}

/// Consume a token. Unknown, already-used and expired tokens all fail — an install
/// can never happen without a fresh preview the user was shown.
fn take_consent(token: &str) -> Result<PendingConsent, String> {
    let mut map = pending().lock().unwrap_or_else(|e| e.into_inner());
    let c = map
        .remove(token)
        .ok_or_else(|| "Install consent expired or was already used.".to_string())?;
    if now_ms() - c.issued_at >= CONSENT_TTL_MS {
        drop_temp(&c);
        return Err("Install consent expired — preview the package again.".into());
    }
    Ok(c)
}

// ─── Changing an installed plugin's permissions ─────────

/// A pending *widening* of an installed plugin's grant, awaiting confirmation.
/// Narrowing needs no ceremony — taking access away is always safe — but handing
/// it back is a fresh decision, so it goes through the same one-shot token dance
/// as an install.
#[derive(Debug)]
struct PendingGrant {
    plugin_id: String,
    permissions: Vec<String>,
    issued_at: i64,
}

fn pending_grants() -> &'static Mutex<HashMap<String, PendingGrant>> {
    static GRANTS: OnceLock<Mutex<HashMap<String, PendingGrant>>> = OnceLock::new();
    GRANTS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Rewrite an installed plugin's `.install.json` grant, keeping everything else.
fn write_grant(id: &str, granted: Vec<String>, hosts: Vec<String>) -> Result<InstalledPlugin, String> {
    let dir = install_dir_for(id);
    let existing: InstallMeta = fs::read(dir.join(".install.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    let meta = InstallMeta {
        granted,
        hosts,
        source: existing.source,
        installed_at: existing.installed_at,
    };
    let json = serde_json::to_vec_pretty(&meta).map_err(|e| e.to_string())?;
    fs::write(dir.join(".install.json"), json).map_err(|e| e.to_string())?;
    read_installed(&dir)
}

/// Take a permission away from an installed plugin. Only ever narrows: the new set
/// must be a subset of what the plugin already has, so this can't be used to grant
/// anything. Returns the plugin as it now stands, for the caller to reload.
#[command]
pub fn revoke_plugin_permissions(
    plugin_id: String,
    keep: Vec<String>,
) -> Result<InstalledPlugin, String> {
    if !valid_id(&plugin_id) {
        return Err("Invalid plugin id.".into());
    }
    let info = read_installed(&install_dir_for(&plugin_id))
        .map_err(|_| "That plugin is not installed.".to_string())?;
    if let Some(extra) = keep.iter().find(|p| !info.granted.contains(p)) {
        return Err(format!(
            "\"{}\" was never granted {} — this only takes permissions away.",
            info.name, extra
        ));
    }
    // Hosts are meaningless once network is gone.
    let hosts = if keep.iter().any(|p| p == "network") { info.hosts.clone() } else { Vec::new() };
    write_grant(&plugin_id, keep, hosts)
}

/// Offer a permission back to a plugin the user previously narrowed. Mints a
/// one-shot token; nothing changes until `apply_plugin_grant` consumes it, so the
/// UI can confirm in between. Capped by what the plugin's own manifest declares —
/// a plugin can never end up with more than it asked for at install.
#[command]
pub fn preview_plugin_grant(
    plugin_id: String,
    permissions: Vec<String>,
) -> Result<ManifestPreview, String> {
    if !valid_id(&plugin_id) {
        return Err("Invalid plugin id.".into());
    }
    let dir = install_dir_for(&plugin_id);
    let manifest_bytes =
        fs::read(dir.join("manifest.json")).map_err(|_| "That plugin is not installed.".to_string())?;
    let manifest = parse_manifest(&manifest_bytes)?;

    let allowed: Vec<String> = permissions
        .into_iter()
        .filter(|p| KNOWN_PERMISSIONS.contains(&p.as_str()) && manifest.permissions.contains(p))
        .collect();
    if allowed.is_empty() {
        return Err(format!("{} did not ask for that permission.", manifest.name));
    }

    let token = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let mut map = pending_grants().lock().unwrap_or_else(|e| e.into_inner());
    map.retain(|_, g| now - g.issued_at < CONSENT_TTL_MS);
    map.insert(
        token.clone(),
        PendingGrant { plugin_id, permissions: allowed, issued_at: now },
    );
    Ok(ManifestPreview { manifest, consent_token: token, sha256: None })
}

/// Apply a confirmed widening. One-shot, expiring, and still bounded by the
/// manifest — the token names the plugin, so the caller cannot redirect it.
#[command]
pub fn apply_plugin_grant(consent_token: String) -> Result<InstalledPlugin, String> {
    let grant = {
        let mut map = pending_grants().lock().unwrap_or_else(|e| e.into_inner());
        map.remove(&consent_token)
            .ok_or_else(|| "That permission change expired or was already applied.".to_string())?
    };
    if now_ms() - grant.issued_at >= CONSENT_TTL_MS {
        return Err("That permission change expired.".into());
    }

    let dir = install_dir_for(&grant.plugin_id);
    let info = read_installed(&dir).map_err(|_| "That plugin is not installed.".to_string())?;
    let manifest = parse_manifest(&fs::read(dir.join("manifest.json")).map_err(|e| e.to_string())?)?;

    let mut granted = info.granted.clone();
    for p in grant.permissions {
        if !granted.contains(&p) {
            granted.push(p);
        }
    }
    let hosts = if granted.iter().any(|p| p == "network") { manifest.hosts.clone() } else { Vec::new() };
    write_grant(&grant.plugin_id, granted, hosts)
}

/// A previewed package: its manifest, the one-shot token authorizing *this*
/// package's install, and (for a download) the SHA-256 of the fetched bytes, so
/// the UI can check it against the catalog entry before asking the user.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestPreview {
    #[serde(flatten)]
    pub manifest: PluginManifest,
    pub consent_token: String,
    pub sha256: Option<String>,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Read a zip's root `manifest.json` without extracting anything.
fn manifest_from_zip(zip_path: &Path) -> Result<PluginManifest, String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("Failed to open zip: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Invalid zip: {}", e))?;
    let mut mf = archive
        .by_name("manifest.json")
        .map_err(|_| "Zip has no manifest.json at its root.".to_string())?;
    let mut buf = Vec::new();
    mf.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    parse_manifest(&buf)
}

/// Peek a zip's manifest without extracting — so the UI can show what the package
/// declares in the install-consent prompt before anything lands on disk.
#[command]
pub fn read_zip_manifest(zip_path: String) -> Result<ManifestPreview, String> {
    let path = PathBuf::from(&zip_path);
    let manifest = manifest_from_zip(&path)?;
    check_app_version(&manifest)?;
    let consent_token = issue_consent(&manifest, ConsentSource::Zip(path), false);
    Ok(ManifestPreview { manifest, consent_token, sha256: None })
}

/// Peek an unpacked folder's manifest (for Load Local Plugin consent).
#[command]
pub fn read_local_manifest(dir: String) -> Result<ManifestPreview, String> {
    let src = PathBuf::from(&dir);
    let bytes = fs::read(src.join("manifest.json"))
        .map_err(|_| "Folder has no manifest.json.".to_string())?;
    let manifest = parse_manifest(&bytes)?;
    check_app_version(&manifest)?;
    let consent_token = issue_consent(&manifest, ConsentSource::Folder(src), false);
    Ok(ManifestPreview { manifest, consent_token, sha256: None })
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

fn write_meta(
    dir: &Path,
    granted: Vec<String>,
    hosts: Vec<String>,
    source: &str,
) -> Result<(), String> {
    let meta = InstallMeta {
        granted,
        hosts,
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
    hosts: Vec<String>,
    source: &str,
    expect_id: &str,
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
    // The package must still be the one the user consented to — otherwise a swapped
    // file would install under a different id (overwriting another plugin) with a
    // permission set the user never saw.
    if manifest.id != expect_id {
        return Err(format!(
            "Package id changed since it was previewed ('{}' vs '{}') — install cancelled.",
            manifest.id, expect_id
        ));
    }

    // Caps before anything is written: entry count, and total *uncompressed* size
    // taken from the headers as we go (a bomb declares its size honestly — it just
    // expects you not to look).
    if archive.len() > MAX_PACKAGE_ENTRIES {
        return Err(format!(
            "Package has {} files, more than the {} allowed.",
            archive.len(),
            MAX_PACKAGE_ENTRIES
        ));
    }

    let dir = install_dir_for(&manifest.id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("Failed to replace existing plugin: {}", e))?;
    }
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create plugin dir: {}", e))?;

    // Second pass: extract every safe entry. Normalize separators so a zip written
    // with backslashes (e.g. PowerShell Compress-Archive) is handled portably.
    let mut written: u64 = 0;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if entry.is_dir() || !safe_relative(&name) {
            continue;
        }
        written = written.saturating_add(entry.size());
        if written > MAX_PACKAGE_BYTES {
            fs::remove_dir_all(&dir).ok();
            return Err(format!(
                "Package unpacks to more than {} MB — install cancelled.",
                MAX_PACKAGE_BYTES / (1024 * 1024)
            ));
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

    write_meta(&dir, granted.clone(), hosts.clone(), source)?;
    Ok(to_installed(
        manifest,
        InstallMeta { granted, hosts, source: source.into(), installed_at: now_ms() },
    ))
}

/// Install an unpacked folder (Developer → Load Local Plugin) by copying it into
/// `plugins_dir()`, so it loads the same way as a zip install.
fn install_folder(
    src: &Path,
    granted: Vec<String>,
    hosts: Vec<String>,
    expect_id: &str,
) -> Result<InstalledPlugin, String> {
    let manifest_bytes = fs::read(src.join("manifest.json"))
        .map_err(|_| "Folder has no manifest.json.".to_string())?;
    let manifest = parse_manifest(&manifest_bytes)?;
    if manifest.id != expect_id {
        return Err(format!(
            "Package id changed since it was previewed ('{}' vs '{}') — install cancelled.",
            manifest.id, expect_id
        ));
    }
    if !src.join(&manifest.main).exists() {
        return Err(format!("Built entry '{}' not found — build the plugin first.", manifest.main));
    }

    let dest = install_dir_for(&manifest.id);
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| format!("Failed to replace existing plugin: {}", e))?;
    }
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    copy_tree(src, &dest)?;
    write_meta(&dest, granted.clone(), hosts.clone(), "local")?;
    Ok(to_installed(
        manifest,
        InstallMeta { granted, hosts, source: "local".into(), installed_at: now_ms() },
    ))
}

/// Install the package a consent token points at. The token carries the source and
/// the permissions that package declared, so the caller supplies neither — there is
/// no way to ask for a grant the user was never shown.
#[command]
pub fn install_plugin(consent_token: String) -> Result<InstalledPlugin, String> {
    let c = take_consent(&consent_token)?;
    let result = match &c.source {
        ConsentSource::Zip(path) => extract_and_register_zip(
            path,
            c.permissions.clone(),
            c.hosts.clone(),
            if c.temp { "catalog" } else { "zip" },
            &c.plugin_id,
        ),
        ConsentSource::Folder(dir) => {
            install_folder(dir, c.permissions.clone(), c.hosts.clone(), &c.plugin_id)
        }
    };
    drop_temp(&c);
    result
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

// ─── Plugin network access ──────────────────────────────

/// What a plugin gets back from `plugin_fetch`. Text only: enough for the JSON
/// APIs plugins actually call, and it keeps binary payloads out of the WebView.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginResponse {
    pub ok: bool,
    pub status: u16,
    pub body: String,
}

/// A response body ceiling for plugin requests — smaller than a package, since
/// this is API traffic, not a download.
const MAX_RESPONSE_BYTES: usize = 5 * 1024 * 1024;

/// Outbound request budget per plugin. The frontend guard already paces calls for
/// both runtimes, but a main-thread plugin can invoke this command directly, so
/// the ceiling is enforced where it cannot be skipped.
const MAX_REQUESTS_PER_MINUTE: usize = 60;
const MAX_CONCURRENT_REQUESTS: usize = 3;

#[derive(Default)]
struct FetchBudget {
    window_start: i64,
    in_window: usize,
    in_flight: usize,
}

fn fetch_budgets() -> &'static Mutex<HashMap<String, FetchBudget>> {
    static BUDGETS: OnceLock<Mutex<HashMap<String, FetchBudget>>> = OnceLock::new();
    BUDGETS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Claim a request slot, or say why not. The guard is released by `release_slot`
/// whatever the request's outcome.
fn claim_fetch_slot(plugin_id: &str) -> Result<(), String> {
    let now = now_ms();
    let mut map = fetch_budgets().lock().unwrap_or_else(|e| e.into_inner());
    let b = map.entry(plugin_id.to_string()).or_default();
    if now - b.window_start >= 60_000 {
        b.window_start = now;
        b.in_window = 0;
    }
    if b.in_flight >= MAX_CONCURRENT_REQUESTS {
        return Err(format!(
            "Too many requests at once (limit {}).",
            MAX_CONCURRENT_REQUESTS
        ));
    }
    if b.in_window >= MAX_REQUESTS_PER_MINUTE {
        return Err(format!(
            "Request limit reached ({} per minute).",
            MAX_REQUESTS_PER_MINUTE
        ));
    }
    b.in_window += 1;
    b.in_flight += 1;
    Ok(())
}

fn release_fetch_slot(plugin_id: &str) {
    let mut map = fetch_budgets().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(b) = map.get_mut(plugin_id) {
        b.in_flight = b.in_flight.saturating_sub(1);
    }
}

/// Make an HTTP request *on behalf of* a plugin. This is the whole of the
/// `network` permission: the WebView's CSP blocks plugin `fetch`, so every request
/// comes through here, where it is checked against what the user approved at
/// install — the permission, and the specific hosts the manifest declared. A
/// plugin that asked for `api.example.com` cannot reach anywhere else.
///
/// Caveat worth keeping in view: a *main-thread* plugin could call this with a
/// different plugin's id, because the WebView can invoke any command. Worker
/// plugins cannot — the host fills in the id. That asymmetry is the trusted
/// main-thread trade-off, not a hole in this check.
#[command]
pub async fn plugin_fetch(
    plugin_id: String,
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<PluginResponse, String> {
    if !valid_id(&plugin_id) {
        return Err("Invalid plugin id.".into());
    }
    let info = read_installed(&install_dir_for(&plugin_id))
        .map_err(|_| "That plugin is not installed.".to_string())?;
    if !info.granted.iter().any(|p| p == "network") {
        return Err(format!("\"{}\" was not granted network access.", info.name));
    }

    let parsed = reqwest::Url::parse(&url).map_err(|_| format!("Invalid URL: {}", url))?;
    if parsed.scheme() != "https" {
        return Err("Plugin requests must use https://.".into());
    }
    let host = parsed.host_str().unwrap_or_default().to_string();
    if !host_allowed(&info.hosts, &host) {
        return Err(format!(
            "\"{}\" may not contact {} — it declared {}.",
            info.name,
            host,
            if info.hosts.is_empty() { "no hosts".to_string() } else { info.hosts.join(", ") }
        ));
    }

    claim_fetch_slot(&plugin_id)?;
    let result = do_fetch(parsed, method, headers, body).await;
    release_fetch_slot(&plugin_id);
    result
}

/// The request itself, split out so the caller can always release its slot.
async fn do_fetch(
    url: reqwest::Url,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<PluginResponse, String> {
    let verb = method.unwrap_or_else(|| "GET".into()).to_ascii_uppercase();
    let method = reqwest::Method::from_bytes(verb.as_bytes())
        .map_err(|_| format!("Unsupported method {}.", verb))?;
    if !matches!(verb.as_str(), "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD") {
        return Err(format!("Unsupported method {}.", verb));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let mut request = client.request(method, url);
    for (name, value) in headers.unwrap_or_default() {
        // Cookies would let a plugin ride credentials it never saw; the rest of
        // the header space is the plugin's own business (API keys and so on).
        if name.eq_ignore_ascii_case("cookie") || name.eq_ignore_ascii_case("host") {
            continue;
        }
        request = request.header(name, value);
    }
    if let Some(body) = body {
        request = request.body(body);
    }

    let resp = request.send().await.map_err(|e| format!("Request failed: {}", e))?;
    let status = resp.status();
    let bytes = resp.bytes().await.map_err(|e| format!("Request failed: {}", e))?;
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(format!(
            "Response is larger than the {} MB limit.",
            MAX_RESPONSE_BYTES / (1024 * 1024)
        ));
    }
    Ok(PluginResponse {
        ok: status.is_success(),
        status: status.as_u16(),
        body: String::from_utf8_lossy(&bytes).to_string(),
    })
}

// ─── The `media` permission ─────────────────────────────

/// A plugin may read an attachment up to this size. Generous for a lecture PDF or
/// an image, small enough that the read can't wedge the WebView: the bytes cross
/// IPC as base64 in the response, so the ceiling is what keeps a plugin from
/// asking for a two-gigabyte video and freezing the app that asked for it.
const MAX_PLUGIN_ASSET_BYTES: u64 = 25 * 1024 * 1024;

/// Read one of the app's assets on behalf of a plugin, as base64.
///
/// The size check happens on the file's metadata *before* anything is read, so an
/// oversized asset costs a stat rather than a copy. `safe_asset_file` keeps the
/// filename inside the assets directory, so a plugin can only reach files Jnana
/// itself stored — never arbitrary host files.
///
/// Same caveat as `plugin_fetch`: a main-thread plugin could pass another
/// plugin's id, because the WebView can invoke any command. Worker plugins
/// cannot — the host fills the id in.
#[command]
pub fn plugin_read_asset(plugin_id: String, filename: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    if !valid_id(&plugin_id) {
        return Err("Invalid plugin id.".into());
    }
    let info = read_installed(&install_dir_for(&plugin_id))
        .map_err(|_| "That plugin is not installed.".to_string())?;
    if !info.granted.iter().any(|p| p == "media") {
        return Err(format!("\"{}\" was not granted access to attachments.", info.name));
    }

    let path = safe_asset_file(&filename)?;
    let size = fs::metadata(&path)
        .map_err(|_| format!("Attachment not found: {}", filename))?
        .len();
    if size > MAX_PLUGIN_ASSET_BYTES {
        return Err(format!(
            "\"{}\" is larger than the {} MB a plugin may read.",
            filename,
            MAX_PLUGIN_ASSET_BYTES / (1024 * 1024)
        ));
    }

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read {}: {}", filename, e))?;
    Ok(STANDARD.encode(bytes))
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
    /// Optional SHA-256 (hex) of that `.zip`. When a catalog supplies one, the app
    /// refuses to install a download whose bytes hash differently.
    #[serde(default)]
    pub sha256: String,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub min_app_version: String,
    /// "worker" when the listing claims the sandboxed runtime; checked against the
    /// package before install so the badge can't lie.
    #[serde(default)]
    pub runtime: String,
    #[serde(default)]
    pub homepage: String,
}

/// Fetch a catalog's bytes from an http(s) URL or a local file path (the latter
/// makes the whole flow testable offline).
async fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    // Plain http would let anyone on the path swap the code we are about to run,
    // and the response is read in chunks so an oversized body is dropped mid-flight
    // rather than buffered whole.
    if url.starts_with("http://") {
        return Err("Plugin sources must use https:// (or a local path).".into());
    }
    if url.starts_with("https://") {
        use futures_util::StreamExt;
        let resp = reqwest::get(url)
            .await
            .map_err(|e| format!("Request failed: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("Request failed: HTTP {}", resp.status()));
        }
        if resp.content_length().is_some_and(|n| n > MAX_PACKAGE_BYTES) {
            return Err(too_big());
        }
        let mut out: Vec<u8> = Vec::new();
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Download failed: {}", e))?;
            if out.len() as u64 + chunk.len() as u64 > MAX_PACKAGE_BYTES {
                return Err(too_big());
            }
            out.extend_from_slice(&chunk);
        }
        Ok(out)
    } else {
        let path = url.strip_prefix("file://").unwrap_or(url);
        let meta = fs::metadata(path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
        if meta.len() > MAX_PACKAGE_BYTES {
            return Err(too_big());
        }
        fs::read(path).map_err(|e| format!("Failed to read {}: {}", path, e))
    }
}

fn too_big() -> String {
    format!("That file is larger than the {} MB limit.", MAX_PACKAGE_BYTES / (1024 * 1024))
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

/// Download a plugin `.zip` (or read a local one) and preview it: the bytes are
/// buffered to a temp file, hashed, and their manifest parsed. The returned
/// `sha256` lets the UI check the download against its catalog entry, and the
/// consent token installs *those* bytes — not a re-fetch that could differ.
#[command]
pub async fn preview_plugin_download(download_url: String) -> Result<ManifestPreview, String> {
    let bytes = fetch_bytes(&download_url).await?;
    let digest = hex(&Sha256::digest(&bytes));
    let tmp = std::env::temp_dir().join(format!("jnana-plugin-{}.zip", uuid::Uuid::new_v4()));
    fs::write(&tmp, &bytes).map_err(|e| format!("Failed to buffer download: {}", e))?;
    let manifest = match manifest_from_zip(&tmp).and_then(|m| check_app_version(&m).map(|_| m)) {
        Ok(m) => m,
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            return Err(e);
        }
    };
    let consent_token = issue_consent(&manifest, ConsentSource::Zip(tmp), true);
    Ok(ManifestPreview { manifest, consent_token, sha256: Some(digest) })
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

    fn manifest_with(id: &str, perms: &[&str]) -> PluginManifest {
        PluginManifest {
            id: id.into(),
            name: "X".into(),
            version: "1".into(),
            description: String::new(),
            author: String::new(),
            main: "dist/main.js".into(),
            min_app_version: String::new(),
            permissions: perms.iter().map(|p| p.to_string()).collect(),
            runtime: String::new(),
            hosts: Vec::new(),
            homepage: String::new(),
            plugin_type: String::new(),
        }
    }

    /// A token installs once, carries only the previewed package's known
    /// permissions, and cannot be reused or invented.
    #[test]
    fn consent_token_is_one_shot_and_carries_declared_permissions() {
        let m = manifest_with("acme", &["notes", "camera"]);
        let token = issue_consent(&m, ConsentSource::Folder(PathBuf::from("/tmp/acme")), false);

        let c = take_consent(&token).expect("fresh token should be accepted");
        assert_eq!(c.plugin_id, "acme");
        // "camera" is not a permission this build knows — it is dropped, not granted.
        assert_eq!(c.permissions, vec!["notes".to_string()]);

        assert!(take_consent(&token).is_err(), "a token must not be reusable");
        assert!(take_consent("made-up-token").is_err());
    }

    /// An expired consent is refused rather than silently honoured.
    #[test]
    fn expired_consent_is_refused() {
        let m = manifest_with("stale", &[]);
        let token = issue_consent(&m, ConsentSource::Folder(PathBuf::from("/tmp/stale")), false);
        {
            let mut map = pending().lock().unwrap();
            map.get_mut(&token).unwrap().issued_at -= CONSENT_TTL_MS + 1;
        }
        assert!(take_consent(&token).is_err());
    }

    /// `minAppVersion` is a gate, not decoration: a package needing a newer build is
    /// refused at preview time instead of failing mid-render later.
    #[test]
    fn min_app_version_gates_installs() {
        assert!(is_newer("0.2.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1", "0.1.0"));

        let mut m = manifest_with("acme", &[]);
        m.min_app_version = "999.0.0".into();
        assert!(check_app_version(&m).is_err());

        m.min_app_version = APP_VERSION.to_string();
        assert!(check_app_version(&m).is_ok());

        m.min_app_version = String::new();
        assert!(check_app_version(&m).is_ok());
    }

    /// A plugin's outbound requests are paced where it cannot skip the check.
    #[test]
    fn fetch_slots_are_limited_and_released() {
        let id = "budget.test";
        // Concurrency: the third in-flight request is the last one allowed.
        for _ in 0..MAX_CONCURRENT_REQUESTS {
            claim_fetch_slot(id).expect("slot within the concurrency limit");
        }
        assert!(claim_fetch_slot(id).is_err());

        // Releasing frees a slot again.
        release_fetch_slot(id);
        assert!(claim_fetch_slot(id).is_ok());
        for _ in 0..MAX_CONCURRENT_REQUESTS {
            release_fetch_slot(id);
        }

        // Per-minute ceiling, independent of concurrency.
        for _ in 0..MAX_REQUESTS_PER_MINUTE {
            let _ = claim_fetch_slot(id);
            release_fetch_slot(id);
        }
        assert!(claim_fetch_slot(id).is_err());
    }

    /// Revoking narrows and only narrows; widening cannot be done by asking nicely.
    #[test]
    fn permission_grants_widen_only_through_a_token() {
        // Unknown tokens and expired ones are refused, so a widening always traces
        // back to a preview the user was shown.
        assert!(apply_plugin_grant("invented".into()).is_err());

        let token = uuid::Uuid::new_v4().to_string();
        {
            let mut map = pending_grants().lock().unwrap();
            map.insert(
                token.clone(),
                PendingGrant {
                    plugin_id: "nope".into(),
                    permissions: vec!["notes".into()],
                    issued_at: now_ms() - CONSENT_TTL_MS - 1,
                },
            );
        }
        assert!(apply_plugin_grant(token).is_err());
    }

    /// Network access is only ever as wide as the hosts the user approved.
    #[test]
    fn declared_hosts_bound_network_access() {
        let allowed = vec!["api.example.com".to_string(), "*.tiles.example.org".to_string()];
        assert!(host_allowed(&allowed, "api.example.com"));
        assert!(host_allowed(&allowed, "API.example.com"));
        assert!(host_allowed(&allowed, "tiles.example.org"));
        assert!(host_allowed(&allowed, "a.tiles.example.org"));
        // Neighbours, lookalikes and the bare parent domain are not covered.
        assert!(!host_allowed(&allowed, "evil.com"));
        assert!(!host_allowed(&allowed, "api.example.com.evil.com"));
        assert!(!host_allowed(&allowed, "notapi.example.com"));
        assert!(!host_allowed(&allowed, "example.org"));
        assert!(!host_allowed(&[], "api.example.com"));

        assert!(valid_host_pattern("api.example.com"));
        assert!(valid_host_pattern("*.example.com"));
        assert!(!valid_host_pattern("localhost"));
        assert!(!valid_host_pattern("https://example.com"));
        assert!(!valid_host_pattern("example.com/path"));
        assert!(!valid_host_pattern("example.com:8080"));
    }

    /// Hosts ride the consent, so they can't be widened after the user saw them —
    /// and they're dropped entirely when `network` wasn't granted.
    #[test]
    fn consent_keeps_hosts_only_with_the_network_permission() {
        let mut m = manifest_with("netty", &["network"]);
        m.hosts = vec!["api.example.com".into()];
        let token = issue_consent(&m, ConsentSource::Folder(PathBuf::from("/tmp/netty")), false);
        assert_eq!(take_consent(&token).unwrap().hosts, vec!["api.example.com".to_string()]);

        let mut quiet = manifest_with("quiet", &[]);
        quiet.hosts = vec!["api.example.com".into()];
        let token = issue_consent(&quiet, ConsentSource::Folder(PathBuf::from("/tmp/quiet")), false);
        assert!(take_consent(&token).unwrap().hosts.is_empty());
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

        // Runtime is validated, and defaults to the main thread when unstated.
        let worker = br#"{"id":"x","name":"X","version":"1","main":"m.js","runtime":"worker"}"#;
        assert_eq!(parse_manifest(worker).unwrap().runtime, "worker");
        let bogus = br#"{"id":"x","name":"X","version":"1","main":"m.js","runtime":"thread"}"#;
        assert!(parse_manifest(bogus).is_err());

        let bad_host = br#"{"id":"x","name":"X","version":"1","main":"m.js","hosts":["http://x.com"]}"#;
        assert!(parse_manifest(bad_host).is_err());
        let bad_home = br#"{"id":"x","name":"X","version":"1","main":"m.js","homepage":"http://x.com"}"#;
        assert!(parse_manifest(bad_home).is_err());
    }
}
