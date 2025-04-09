use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            // Start the operator sidecar when the app launches
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match app_handle.shell().sidecar("operator") {
                    Ok(sidecar) => {
                        match sidecar.spawn() {
                            Ok((mut rx, _child)) => {
                                // Optionally handle the sidecar output
                                tauri::async_runtime::spawn(async move {
                                    while let Some(event) = rx.recv().await {
                                        if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                                            println!("Operator output: {}", String::from_utf8_lossy(&line));
                                        }
                                    }
                                });
                                println!("Successfully started operator sidecar");
                            },
                            Err(e) => eprintln!("Failed to spawn operator sidecar: {}", e)
                        }
                    },
                    Err(e) => eprintln!("Failed to create operator sidecar: {}", e)
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}