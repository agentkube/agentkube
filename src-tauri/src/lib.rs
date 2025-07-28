use tauri::RunEvent;


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--auto-launch"]),
        ))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_websocket::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_cors_fetch::init())
        .setup(|app| {
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register("agentkube")?;
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                println!("Window destroyed, cleaning up resources...");
                // The window is being destroyed, app will exit soon
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| match event {
            RunEvent::Ready => {
                println!("App is ready!");
            },
            RunEvent::Exit => {
                println!("App is exiting...");
                
                // Kill processes running on ports 4688 and 4689
                #[cfg(target_os = "windows")]
                {
                    let _ = std::process::Command::new("cmd")
                        .args(["/C", "for /f \"tokens=5\" %a in ('netstat -aon ^| find \":4688\"') do taskkill /F /PID %a"])
                        .output();
                    let _ = std::process::Command::new("cmd")
                        .args(["/C", "for /f \"tokens=5\" %a in ('netstat -aon ^| find \":4689\"') do taskkill /F /PID %a"])
                        .output();
                }
                
                #[cfg(any(target_os = "linux", target_os = "macos"))]
                {
                    let _ = std::process::Command::new("sh")
                        .args(["-c", "lsof -ti:4688 | xargs -r kill -9"])
                        .output();
                    let _ = std::process::Command::new("sh")
                        .args(["-c", "lsof -ti:4689 | xargs -r kill -9"])
                        .output();
                }
                
                println!("Killed processes on ports 4688 and 4689");
            },
            _ => {}
        });
}
