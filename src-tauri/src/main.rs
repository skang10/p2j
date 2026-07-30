#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn data_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("no data directory: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create directory: {e}"))?;
    Ok(dir.join("checkin.json"))
}

#[tauri::command]
fn load_data(app: AppHandle) -> Result<String, String> {
    let path = data_file(&app)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        // First launch: no file yet. Not an error.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("read failed: {e}")),
    }
}

#[tauri::command]
fn save_data(app: AppHandle, data: String) -> Result<(), String> {
    let path = data_file(&app)?;
    // Write to a temp file, then rename. Rename within a directory is atomic, so a crash or
    // power loss leaves either the old file or the new one — never a truncated JSON.
    // This is the one place worth three extra lines: losing the log means losing everything.
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| format!("write failed: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("replace failed: {e}"))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_data, save_data])
        .run(tauri::generate_context!())
        .expect("failed to start");
}
