#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use commands::ai::*;
use commands::ai_workspace::*;
use commands::annotations::*;
use commands::assets::*;
use commands::canvas::*;
use commands::chat::*;
use commands::data::*;
use commands::embeddings::*;
use commands::export::*;
use commands::media::*;
use commands::notes::*;
use commands::web::*;
use commands::workspaces::*;

use std::io::{Read, Seek, SeekFrom};
use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

fn mime_from_ext(ext: &str) -> &'static str {
    match ext {
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "ogg" => "video/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "flac" => "audio/flac",
        "oga" | "opus" => "audio/ogg",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "pdf" => "application/pdf",
        _ => "application/octet-stream",
    }
}

fn main() {
    tauri::Builder::default()
        // Logging first so the database init/migrations below are captured. Writes
        // to stdout, a rotating file in the OS log dir, and the devtools console.
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: Some("jnana".into()) }),
                    Target::new(TargetKind::Webview),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // AI settings (incl. the API key) live Rust-side — see commands/ai.rs.
        .manage(AiState(Mutex::new(load_config_from_disk())))
        // Cancellation flags for in-flight streaming chat requests.
        .manage(StreamCancels::default())
        // Initialize the database after the logger is installed so migrations and
        // any staged restore-swap are logged. Shared with all commands via state.
        .setup(|app| {
            log::info!("Jnana starting — v{}", env!("CARGO_PKG_VERSION"));
            let conn = db::init_db().expect("Failed to initialize database");
            app.manage(Mutex::new(conn));
            Ok(())
        })
        .register_uri_scheme_protocol("jnana-asset", |_app, request| {
            let path = request.uri().path();
            let filename = path.trim_start_matches('/');

            // Shared guard: rejects traversal/absolute names and confirms the
            // resolved file stays inside assets_dir() (see db::safe_asset_file).
            let filepath = match db::safe_asset_file(filename) {
                Ok(p) => p,
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(400)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(b"Invalid filename".to_vec())
                        .unwrap();
                }
            };

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
            sync_links,
            save_asset,
            get_asset,
            get_asset_path,
            open_asset,
            import_media,
            convert_to_pdf,
            extract_text,
            register_media_ref,
            get_media_refs,
            get_media_types,
            recent_media,
            save_annotation,
            get_annotations_for_note,
            get_annotations_for_media,
            update_annotation,
            delete_annotation,
            add_favourite,
            get_favourite_note_ids,
            remove_favourite,
            set_note_progress,
            list_note_progress,
            get_ai_config,
            set_ai_config,
            ai_request,
            ai_chat_stream,
            ai_chat_cancel,
            transcribe_audio,
            import_file,
            export_notes,
            export_assets,
            get_storage_stats,
            create_backup,
            restore_backup,
            import_markdown_dir,
            open_logs_dir,
            list_workspaces,
            save_workspace,
            delete_workspace,
            list_workspace_counts,
            list_workspace_notes,
            add_workspace_note,
            add_workspace_notes,
            remove_workspace_note,
            set_workspace_note_pinned,
            list_note_workspace_ids,
            list_collections,
            save_collection,
            delete_collection,
            list_collection_note_ids,
            add_collection_note,
            remove_collection_note,
            get_or_create_workspace_canvas,
            list_canvases,
            get_canvas,
            save_canvas,
            rename_canvas,
            delete_canvas,
            fetch_link_preview,
            save_note_embeddings,
            search_embeddings,
            delete_note_embeddings,
            get_indexed_note_ids,
            get_index_stats,
            get_index_times,
            list_conversations,
            get_conversation,
            save_conversation,
            delete_conversation,
            rename_conversation,
            list_presets,
            save_preset,
            delete_preset,
            list_projects,
            save_project,
            delete_project,
            list_project_knowledge,
            add_project_knowledge,
            remove_project_knowledge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}