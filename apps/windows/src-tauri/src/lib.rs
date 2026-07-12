use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use tauri::Emitter;

#[tauri::command]
fn vault_password() -> Result<String, String> {
    let entry = keyring::Entry::new("uk.gurunet.windows", "device-vault").map_err(|e| e.to_string())?;
    if let Ok(secret) = entry.get_password() { return Ok(secret); }
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let secret = URL_SAFE_NO_PAD.encode(bytes);
    entry.set_password(&secret).map_err(|e| e.to_string())?;
    Ok(secret)
}

#[tauri::command]
fn device_id() -> Result<String, String> {
    let entry = keyring::Entry::new("uk.gurunet.windows", "device-id").map_err(|e| e.to_string())?;
    if let Ok(existing) = entry.get_password() {
        return Ok(existing);
    }
    let mut bytes = [0u8; 18];
    rand::rng().fill_bytes(&mut bytes);
    let id = format!("windows-{}", URL_SAFE_NO_PAD.encode(bytes));
    entry.set_password(&id).map_err(|e| e.to_string())?;
    Ok(id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(url) = argv.into_iter().find(|arg| arg.starts_with("gurunet-windows://")) {
                let _ = app.emit("app-deep-link", url);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_stronghold::Builder::new(|password| password.to_vec()).build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![vault_password, device_id])
        .run(tauri::generate_context!())
        .expect("failed to run GURUnet");
}
