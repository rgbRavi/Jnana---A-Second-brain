// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Jnana Project

// User-installed fonts. Files are copied into `assets_dir()` as `font-<uuid>.<ext>`
// (served to the WebView through the existing `jnana-asset://` protocol, which is
// already CSP-allowed), and family metadata lives in `data_dir/fonts.json` — no DB
// migration. Faces are grouped into families: the family NAME comes from the font's
// embedded `name` table via allsorts (which also decodes woff2), and the weight /
// italic / generic class are derived from the filename (reliable for real font
// files), so a corrupt or oddly-embedded font still installs sensibly.

use crate::db::{assets_dir, data_dir};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Cursor, Read};
use std::path::PathBuf;
use uuid::Uuid;

const MAX_FONT_BYTES: usize = 20 * 1024 * 1024; // 20 MB per file — sanity guard
const FONT_EXTS: [&str; 4] = ["woff2", "woff", "ttf", "otf"];

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FontFace {
    pub file: String, // "font-<uuid>.woff2"
    pub weight: u16,
    pub italic: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFont {
    pub id: String,
    pub family: String,
    pub generic: String, // "sans" | "serif" | "mono" — CSS fallback class
    pub faces: Vec<FontFace>,
}

#[derive(Serialize, Deserialize, Default)]
struct FontsManifest {
    fonts: Vec<InstalledFont>,
}

// Returned to the frontend: each face carries a `data:` URL rather than a filename.
// @font-face is a CORS-mode fetch and Chromium refuses CORS to custom schemes like
// jnana-asset://, so the face bytes are inlined as a data URI (an allowed scheme).
// The base64 lives only in the response, never on disk.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaceOut {
    pub weight: u16,
    pub italic: bool,
    pub src: String, // data:font/...;base64,…
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontOut {
    pub id: String,
    pub family: String,
    pub generic: String,
    pub faces: Vec<FaceOut>,
}

fn face_data_url(file: &str) -> Option<String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    let bytes = fs::read(assets_dir().join(file)).ok()?;
    let ext = file.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    let mime = match ext.as_str() {
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "otf" => "font/otf",
        _ => "font/ttf",
    };
    Some(format!("data:{};base64,{}", mime, STANDARD.encode(bytes)))
}

fn to_out(f: &InstalledFont) -> FontOut {
    FontOut {
        id: f.id.clone(),
        family: f.family.clone(),
        generic: f.generic.clone(),
        faces: f
            .faces
            .iter()
            .filter_map(|face| {
                face_data_url(&face.file).map(|src| FaceOut {
                    weight: face.weight,
                    italic: face.italic,
                    src,
                })
            })
            .collect(),
    }
}

fn manifest_path() -> PathBuf {
    data_dir().join("fonts.json")
}

fn read_manifest() -> FontsManifest {
    match fs::read_to_string(manifest_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|e| {
            log::warn!("fonts.json is corrupt, treating as empty: {}", e);
            FontsManifest::default()
        }),
        Err(_) => FontsManifest::default(),
    }
}

fn write_manifest(m: &FontsManifest) -> Result<(), String> {
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create data dir: {}", e))?;
    let json = serde_json::to_string_pretty(m).map_err(|e| e.to_string())?;
    fs::write(manifest_path(), json).map_err(|e| format!("Failed to write fonts.json: {}", e))
}

/// A single face parsed from one font file, before it's grouped into a family.
struct ParsedFace {
    family: String,
    generic: String,
    weight: u16,
    italic: bool,
}

/// Best-effort family name from the font's embedded `name` table (allsorts decodes
/// woff2 too). Returns None on any parse failure so the caller falls back to the
/// filename — kept deliberately small to minimise the allsorts surface area.
fn embedded_family(bytes: &[u8]) -> Option<String> {
    use allsorts::binary::read::ReadScope;
    use allsorts::font_data::FontData;
    use allsorts::tables::{FontTableProvider, NameTable};
    use allsorts::tag;

    let scope = ReadScope::new(bytes);
    let font_file = scope.read::<FontData<'_>>().ok()?;
    let provider = font_file.table_provider(0).ok()?;
    let name_data = provider.read_table_data(tag::NAME).ok()?;
    let name_table = ReadScope::new(&name_data).read::<NameTable<'_>>().ok()?;
    // 16 = typographic (preferred) family, 1 = legacy family name.
    let family = name_table
        .string_for_id(16)
        .or_else(|| name_table.string_for_id(1))?;
    let family = family.trim().to_string();
    if family.is_empty() {
        None
    } else {
        Some(family)
    }
}

/// Weight / italic / generic (and a fallback family) from a filename like
/// `Inter-SemiBoldItalic.woff2` or `roboto-700-normal.ttf`.
fn parse_from_filename(filename: &str) -> ParsedFace {
    let stem = filename.rsplit_once('.').map(|(s, _)| s).unwrap_or(filename);
    let lower = stem.to_ascii_lowercase();

    let italic = lower.contains("italic") || lower.contains("oblique");
    let generic = if lower.contains("mono") {
        "mono"
    } else if lower.contains("serif") && !lower.contains("sans") {
        "serif"
    } else {
        "sans"
    };

    // Named weight tokens (checked longest-first so "extrabold" beats "bold").
    let weight_tokens: [(&str, u16); 16] = [
        ("hairline", 100), ("extralight", 200), ("ultralight", 200), ("semibold", 600),
        ("demibold", 600), ("extrabold", 800), ("ultrabold", 800), ("thin", 100),
        ("light", 300), ("regular", 400), ("normal", 400), ("book", 400),
        ("medium", 500), ("black", 900), ("heavy", 900), ("bold", 700),
    ];
    let mut weight = weight_tokens
        .iter()
        .find(|(t, _)| lower.contains(t))
        .map(|(_, w)| *w)
        .unwrap_or(0);
    // A bare numeric weight (100..900) overrides / fills in.
    for w in [100u16, 200, 300, 400, 500, 600, 700, 800, 900] {
        if lower.contains(&w.to_string()) {
            weight = w;
            break;
        }
    }
    if weight == 0 {
        weight = 400;
    }

    // Fallback family: drop the trailing weight/style descriptor after a '-' or '_'.
    let family = stem
        .split(['-', '_'])
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or(stem)
        .trim()
        .to_string();

    ParsedFace { family, generic: generic.to_string(), weight, italic }
}

/// Weight/style words that older static fonts append to the *legacy* family name
/// (e.g. "Dancing Script Medium"). Stripped so every weight of a family groups
/// together. Deliberately excludes width words ("Condensed"/"Expanded") — those
/// denote genuinely separate families (e.g. "Roboto Condensed").
const STYLE_WORDS: [&str; 18] = [
    "thin", "extralight", "ultralight", "light", "regular", "normal", "book", "medium",
    "semibold", "demibold", "bold", "extrabold", "ultrabold", "black", "heavy", "hairline",
    "italic", "oblique",
];

/// Drop trailing weight/style words from a family name so "Dancing Script Medium"
/// and "Dancing Script SemiBold" both become "Dancing Script". Only strips known
/// style tokens, so real name words ("Script") are kept.
fn normalize_family(name: &str) -> String {
    let mut words: Vec<&str> = name.split_whitespace().collect();
    while words.len() > 1 {
        let last = words[words.len() - 1].to_ascii_lowercase();
        if STYLE_WORDS.contains(&last.as_str()) {
            words.pop();
        } else {
            break;
        }
    }
    words.join(" ")
}

fn parse_face(bytes: &[u8], filename: &str) -> ParsedFace {
    let mut face = parse_from_filename(filename);
    if let Some(fam) = embedded_family(bytes) {
        face.family = fam; // embedded name is cleaner than the filename stem
    }
    face.family = normalize_family(&face.family);
    face
}

/// Collect (bytes, extension, original filename) from an input path — a bare font
/// file or a .zip we extract font entries from.
fn collect_font_files(path: &str) -> Result<Vec<(Vec<u8>, String, String)>, String> {
    let p = PathBuf::from(path);
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid path".to_string())?
        .to_string();
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    if ext == "zip" {
        let bytes = fs::read(&p).map_err(|e| format!("Failed to read {}: {}", name, e))?;
        let mut archive =
            zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("Bad zip: {}", e))?;
        let mut out = Vec::new();
        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
            let ename = entry.name().to_string();
            let eext = ename.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
            if !FONT_EXTS.contains(&eext.as_str()) {
                continue;
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            if buf.len() <= MAX_FONT_BYTES {
                let base = ename.rsplit('/').next().unwrap_or(&ename).to_string();
                out.push((buf, eext, base));
            }
        }
        Ok(out)
    } else if FONT_EXTS.contains(&ext.as_str()) {
        let bytes = fs::read(&p).map_err(|e| format!("Failed to read {}: {}", name, e))?;
        if bytes.len() > MAX_FONT_BYTES {
            return Err(format!("{} is larger than 20 MB", name));
        }
        Ok(vec![(bytes, ext, name)])
    } else {
        Err(format!("{} is not a font or zip", name))
    }
}

/// Install fonts from the given file paths (font files and/or zips). Returns the
/// families that were created or modified by this call.
#[tauri::command]
pub fn install_fonts(paths: Vec<String>) -> Result<Vec<FontOut>, String> {
    let dir = assets_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create assets dir: {}", e))?;

    let mut manifest = read_manifest();
    let mut touched_ids: Vec<String> = Vec::new();

    for path in &paths {
        let files = collect_font_files(path)?;
        for (bytes, ext, filename) in files {
            let parsed = parse_face(&bytes, &filename);
            let stored = format!("font-{}.{}", Uuid::new_v4(), ext);
            fs::write(dir.join(&stored), &bytes)
                .map_err(|e| format!("Failed to store {}: {}", filename, e))?;
            let face = FontFace { file: stored, weight: parsed.weight, italic: parsed.italic };

            // Merge into an existing family (case-insensitive) or create one.
            if let Some(fam) = manifest
                .fonts
                .iter_mut()
                .find(|f| f.family.eq_ignore_ascii_case(&parsed.family))
            {
                // A same weight+italic face replaces the old file (delete the orphan).
                if let Some(old) = fam
                    .faces
                    .iter()
                    .position(|x| x.weight == face.weight && x.italic == face.italic)
                {
                    let _ = fs::remove_file(dir.join(&fam.faces[old].file));
                    fam.faces[old] = face;
                } else {
                    fam.faces.push(face);
                }
                if !touched_ids.contains(&fam.id) {
                    touched_ids.push(fam.id.clone());
                }
            } else {
                let id = Uuid::new_v4().to_string();
                manifest.fonts.push(InstalledFont {
                    id: id.clone(),
                    family: parsed.family,
                    generic: parsed.generic.to_string(),
                    faces: vec![face],
                });
                touched_ids.push(id);
            }
        }
    }

    if touched_ids.is_empty() {
        return Err("No fonts found in the selected files".to_string());
    }
    write_manifest(&manifest)?;
    Ok(manifest
        .fonts
        .iter()
        .filter(|f| touched_ids.contains(&f.id))
        .map(to_out)
        .collect())
}

#[tauri::command]
pub fn list_fonts() -> Result<Vec<FontOut>, String> {
    Ok(read_manifest().fonts.iter().map(to_out).collect())
}

#[tauri::command]
pub fn remove_font(id: String) -> Result<(), String> {
    let mut manifest = read_manifest();
    let dir = assets_dir();
    if let Some(pos) = manifest.fonts.iter().position(|f| f.id == id) {
        let removed = manifest.fonts.remove(pos);
        for face in &removed.faces {
            let _ = fs::remove_file(dir.join(&face.file));
        }
        write_manifest(&manifest)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_weight_style_from_filename() {
        let f = parse_from_filename("Inter-SemiBoldItalic.woff2");
        assert_eq!(f.family, "Inter");
        assert_eq!(f.weight, 600);
        assert!(f.italic);
        assert_eq!(f.generic, "sans");

        let mono = parse_from_filename("JetBrainsMono-Bold.ttf");
        assert_eq!(mono.weight, 700);
        assert!(!mono.italic);
        assert_eq!(mono.generic, "mono");

        let reg = parse_from_filename("Newsreader.otf");
        assert_eq!(reg.weight, 400);
    }

    #[test]
    fn numeric_weight_in_filename() {
        let f = parse_from_filename("roboto-latin-700-normal.woff2");
        assert_eq!(f.weight, 700);
        assert!(!f.italic);
    }

    #[test]
    fn normalize_family_merges_weight_suffixed_names() {
        assert_eq!(normalize_family("Dancing Script Medium"), "Dancing Script");
        assert_eq!(normalize_family("Dancing Script SemiBold"), "Dancing Script");
        assert_eq!(normalize_family("Source Sans SemiBold Italic"), "Source Sans");
        // real name words are preserved
        assert_eq!(normalize_family("Dancing Script"), "Dancing Script");
        assert_eq!(normalize_family("Roboto"), "Roboto");
        // width families stay distinct (not stripped)
        assert_eq!(normalize_family("Roboto Condensed"), "Roboto Condensed");
    }
}
