use tauri::{RunEvent, Manager};
use std::sync::Arc;
use tokio::sync::Mutex;

mod network_monitor;
mod network_commands;

use network_monitor::NetworkMonitor;
use network_commands::{NetworkMonitorState, get_network_status, start_network_monitoring};


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_network_status,
            start_network_monitoring
        ])
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

            // Initialize network monitor
            let network_monitor = NetworkMonitor::new(app.handle().clone());
            let network_monitor_state: NetworkMonitorState = Arc::new(Mutex::new(network_monitor));
            app.manage(network_monitor_state);

            // Enhanced logging configuration
            app.handle().plugin(
                tauri_plugin_log::Builder::new()
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Debug
                    } else {
                        log::LevelFilter::Info
                    })
                    .targets([
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { 
                            file_name: Some("agentkube".to_string()) 
                        }),
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
                    ])
                    .build(),
            )?;
            
            log::info!("Tauri application setup completed successfully");
            
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                log::info!("Window destroyed, cleaning up resources...");
                // The window is being destroyed, app will exit soon
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| match event {
            RunEvent::Ready => {
                log::info!("App is ready!");
            },
            RunEvent::Exit => {
                log::info!("App is exiting...");
                
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
                
                log::info!("Killed processes on ports 4688 and 4689");
            },
            _ => {}
        });
}
