use tauri_plugin_shell::ShellExt;

#[tauri::command]
async fn call_my_sidecar(app: tauri::AppHandle) {
  let sidecar_command = app
    .shell()
    .sidecar("bin/operator/operator")
    .unwrap();
  let (mut _rx, mut _child) = sidecar_command.spawn().unwrap();
}