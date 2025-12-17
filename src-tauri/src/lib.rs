use std::process::Command;
use std::sync::Arc;
use tauri::{Manager, RunEvent};
use tokio::sync::Mutex;

mod browser;
mod network_commands;
mod network_monitor;
mod terminal;

use browser::{
    browser_go_back, browser_go_forward, browser_navigate, browser_reload, close_browser_webview,
    create_browser_webview, get_browser_url, hide_browser_webview, show_browser_webview,
    update_browser_bounds, BrowserManager, BrowserManagerState,
};
use network_commands::{get_network_status, start_network_monitoring, NetworkMonitorState};
use network_monitor::NetworkMonitor;
use terminal::{
    close_all_sessions, close_session, create_local_shell, get_all_sessions,
    launch_external_terminal, read_from_pty, rename_session, resize_pty, write_to_pty,
    TerminalManager, TerminalManagerState,
};

#[cfg(windows)]
fn kill_process_by_port_enhanced(port: u16) {
    log::info!("Attempting to kill process using port {} (enhanced)", port);

    let netstat_output = Command::new("netstat").args(["-ano"]).output();

    if let Ok(output) = netstat_output {
        let output_str = String::from_utf8_lossy(&output.stdout);

        for line in output_str.lines() {
            if line.contains(&format!(":{}", port)) && line.contains("LISTENING") {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if let Some(pid_str) = parts.last() {
                    if let Ok(pid) = pid_str.parse::<u32>() {
                        log::info!("Found process using port {}: PID {}", port, pid);

                        // Try taskkill with force flag
                        let result = Command::new("taskkill")
                            .args(["/F", "/PID", &pid.to_string()])
                            .output();

                        match result {
                            Ok(output) => {
                                if output.status.success() {
                                    log::info!(
                                        "Successfully killed process PID {} on port {}",
                                        pid,
                                        port
                                    );
                                } else {
                                    log::error!(
                                        "Failed to kill process PID {} on port {}: {}",
                                        pid,
                                        port,
                                        String::from_utf8_lossy(&output.stderr)
                                    );
                                }
                            }
                            Err(e) => {
                                log::error!(
                                    "Error executing taskkill for PID {} on port {}: {}",
                                    pid,
                                    port,
                                    e
                                );
                            }
                        }
                        break;
                    }
                }
            }
        }
    } else {
        log::error!("Failed to execute netstat command");
    }
}

// Initialization state for splashscreen
#[derive(Default)]
struct InitializationState {
    frontend_complete: bool,
}

#[tauri::command]
async fn complete_initialization(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<Mutex<InitializationState>>>,
) -> Result<(), String> {
    log::info!("Completing initialization...");

    let mut init_state = state.lock().await;
    init_state.frontend_complete = true;

    // Close splashscreen and show main window
    if let Some(splashscreen) = app.get_webview_window("splashscreen") {
        if let Err(e) = splashscreen.close() {
            log::warn!("Failed to close splashscreen window: {}", e);
        } else {
            log::info!("Splashscreen window closed");
        }
    }

    if let Some(main_window) = app.get_webview_window("main") {
        if let Err(e) = main_window.show() {
            log::warn!("Failed to show main window: {}", e);
        } else {
            log::info!("Main window shown");
        }

        if let Err(e) = main_window.set_focus() {
            log::warn!("Failed to focus main window: {}", e);
        } else {
            log::info!("Main window focused");
        }
    } else {
        log::error!("Main window not found!");
        return Err("Main window not found".to_string());
    }

    log::info!("Application initialization complete");
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_network_status,
            start_network_monitoring,
            complete_initialization,
            // Terminal commands
            create_local_shell,
            write_to_pty,
            read_from_pty,
            resize_pty,
            close_session,
            get_all_sessions,
            rename_session,
            close_all_sessions,
            launch_external_terminal,
            // Browser commands
            create_browser_webview,
            browser_navigate,
            browser_go_back,
            browser_go_forward,
            browser_reload,
            update_browser_bounds,
            show_browser_webview,
            hide_browser_webview,
            close_browser_webview,
            get_browser_url
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

            // Initialize splashscreen state
            let init_state = Arc::new(Mutex::new(InitializationState::default()));
            app.manage(init_state);

            // Initialize terminal manager
            let terminal_manager: TerminalManagerState =
                std::sync::Arc::new(std::sync::Mutex::new(TerminalManager::new()));
            app.manage(terminal_manager);

            // Initialize browser manager
            let browser_manager: BrowserManagerState =
                std::sync::Arc::new(std::sync::Mutex::new(BrowserManager::new()));
            app.manage(browser_manager);

            // Close any leftover browser windows from previous sessions
            let app_handle = app.handle().clone();
            for (label, window) in app_handle.webview_windows() {
                if label.starts_with("browser-") {
                    log::info!("Closing leftover browser window: {}", label);
                    let _ = window.close();
                }
            }

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
                            file_name: Some("agentkube".to_string()),
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
            }
            RunEvent::Exit => {
                log::info!("App is exiting...");

                // Kill processes running on ports 4688 and 4689
                #[cfg(target_os = "windows")]
                {
                    log::info!("Starting Windows process cleanup...");
                    kill_process_by_port_enhanced(4688); // operator
                    kill_process_by_port_enhanced(4689); // orchestrator
                }

                #[cfg(any(target_os = "linux", target_os = "macos"))]
                {
                    log::info!("Starting Unix process cleanup...");
                    let _ = Command::new("sh")
                        .args(["-c", "lsof -ti:4688 | xargs -r kill -9"])
                        .output();
                    let _ = Command::new("sh")
                        .args(["-c", "lsof -ti:4689 | xargs -r kill -9"])
                        .output();
                }

                log::info!("Process cleanup completed");
            }
            _ => {}
        });
}
