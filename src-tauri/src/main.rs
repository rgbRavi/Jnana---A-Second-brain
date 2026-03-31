#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use commands::annotations::*;
use commands::assets::*;
use commands::media::*;
use commands::notes::*;

use std::io::{Read, Seek, SeekFrom};
use std::sync::Mutex;

fn mime_from_ext(ext: &str) -> &'static str {
    match ext {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "ogg" => "video/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn main() {
    // Initialize database ONCE at startup.
    let conn = db::init_db().expect("Failed to initialize database");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Share the single connection with all commands via managed state.
        .manage(Mutex::new(conn))
        .register_uri_scheme_protocol("jnana-asset", |_app, request| {
            let path = request.uri().path();
            let filename = path.trim_start_matches('/');

            if filename.is_empty() {
                return tauri::http::Response::builder()
                    .status(400)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(b"Missing filename".to_vec())
                    .unwrap();
            }

            let filepath = db::assets_dir().join(filename);

            if !filepath.exists() {
                return tauri::http::Response::builder()
                    .status(404)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(b"Not found".to_vec())
                    .unwrap();
            }

            let ext = filepath
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            let content_type = mime_from_ext(ext);

            let file_size = std::fs::metadata(&filepath)
                .map(|m| m.len())
                .unwrap_or(0);

            // Check for Range header (for video seeking / streaming)
            let range_header = request
                .headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            if let Some(ref range_str) = range_header {
                if let Some(range) = range_str.strip_prefix("bytes=") {
                    let parts: Vec<&str> = range.splitn(2, '-').collect();
                    let start: u64 = parts[0].parse().unwrap_or(0);
                    let end: u64 = if parts.len() > 1 && !parts[1].is_empty() {
                        parts[1].parse().unwrap_or(file_size - 1)
                    } else {
                        std::cmp::min(start + 8 * 1024 * 1024, file_size) - 1
                    };
                    let end = std::cmp::min(end, file_size - 1);
                    let length = (end - start + 1) as usize;

                    if let Ok(mut file) = std::fs::File::open(&filepath) {
                        let _ = file.seek(SeekFrom::Start(start));
                        let mut buffer = vec![0u8; length];
                        let _ = file.read_exact(&mut buffer);

                        return tauri::http::Response::builder()
                            .status(206)
                            .header("Access-Control-Allow-Origin", "*")
                            .header("Content-Type", content_type)
                            .header(
                                "Content-Range",
                                format!("bytes {}-{}/{}", start, end, file_size),
                            )
                            .header("Content-Length", length.to_string())
                            .header("Accept-Ranges", "bytes")
                            .body(buffer)
                            .unwrap();
                    }
                }
            }

            // Full file response (for images or small files)
            let bytes = std::fs::read(&filepath).unwrap_or_default();
            tauri::http::Response::builder()
                .status(200)
                .header("Access-Control-Allow-Origin", "*")
                .header("Content-Type", content_type)
                .header("Content-Length", file_size.to_string())
                .header("Accept-Ranges", "bytes")
                .body(bytes)
                .unwrap()
        })
        .invoke_handler(tauri::generate_handler![
            get_all_notes,
            get_note,
            save_note,
            delete_note,
            get_links,
            get_all_links,
            create_link,
            remove_link,
            save_asset,
            get_asset,
            get_asset_path,
            import_vid,
            register_media_ref,
            get_media_refs,
            save_annotation,
            get_annotations_for_note,
            get_annotations_for_media,
            update_annotation,
            delete_annotation,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}