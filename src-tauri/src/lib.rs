use std::time::Duration;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{ShellExt, process::CommandEvent, process::CommandChild};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize a state to store the child process with proper type annotation
    let child_state: Mutex<Option<CommandChild>> = Mutex::new(None);
    
    tauri::Builder::default()
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
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Store our child_state in the app state
            app.manage(child_state);
            
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
        .run(|app_handle, event| match event {
            RunEvent::Ready => {
                // Start the operator sidecar when the app is fully ready
                let app_handle_clone = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    // Wait a short time to ensure any previous instances have completely terminated
                    std::thread::sleep(Duration::from_millis(500));
                    
                    match app_handle_clone.shell().sidecar("operator") {
                        Ok(sidecar) => {
                            match sidecar.spawn() {
                                Ok((mut rx, child)) => {
                                    // Store the child process so we can terminate it later
                                    let state = app_handle_clone.state::<Mutex<Option<CommandChild>>>();
                                    *state.lock().unwrap() = Some(child);
                                    
                                    // Optionally handle the sidecar output
                                    tauri::async_runtime::spawn(async move {
                                        while let Some(event) = rx.recv().await {
                                            match event {
                                                CommandEvent::Stdout(line) => {
                                                    println!("Operator output: {}", String::from_utf8_lossy(&line));
                                                },
                                                CommandEvent::Stderr(line) => {
                                                    eprintln!("Operator error: {}", String::from_utf8_lossy(&line));
                                                },
                                                CommandEvent::Error(err) => {
                                                    eprintln!("Operator process error: {}", err);
                                                },
                                                CommandEvent::Terminated(status) => {
                                                    println!("Operator process terminated with status: {:?}", status);
                                                    
                                                    // If the process terminated unexpectedly, try to restart it
                                                    if status.code.unwrap_or(-1) != 0 {
                                                        println!("Attempting to restart operator...");
                                                        // Add restart logic here if needed
                                                    }
                                                },
                                                _ => {}
                                            }
                                        }
                                    });
                                    
                                    println!("Successfully started operator sidecar");
                                }
                                Err(e) => eprintln!("Failed to spawn operator sidecar: {}", e),
                            }
                        }
                        Err(e) => eprintln!("Failed to create operator sidecar: {}", e),
                    }
                });
            },
            RunEvent::Exit => {
                // Make sure to terminate the sidecar process
                let state = app_handle.state::<Mutex<Option<CommandChild>>>();
                println!("Terminating operator sidecar...");
                
                // Fix the borrowing issue by using a separate scope
                {
                    let mut lock = state.lock().unwrap();
                    if let Some(child) = lock.take() {
                        let _ = child.kill();
                    }
                } // lock is dropped here
                
            },
            _ => {}
        });
}