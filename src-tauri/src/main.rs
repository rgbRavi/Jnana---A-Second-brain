#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::notes::*;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_all_notes,
            get_note,
            save_note,
            delete_note,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}