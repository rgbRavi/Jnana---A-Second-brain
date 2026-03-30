#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use commands::notes::*;
use commands::assets::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}