use std::sync::Mutex;
use std::time::Duration;
use std::process::Command;
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

// Function to kill processes by name (cross-platform)
fn kill_process_by_name(process_name: &str) {
    println!("Attempting to kill any existing '{}' processes...", process_name);
    
    #[cfg(target_os = "windows")]
    {
        // Windows: use taskkill
        let output = Command::new("taskkill")
            .args(&["/F", "/IM", &format!("{}.exe", process_name)])
            .output();
        
        match output {
            Ok(o) => {
                if o.status.success() {
                    println!("Successfully terminated {} processes", process_name);
                } else {
                    let err = String::from_utf8_lossy(&o.stderr);
                    // It's normal to get an error if no processes are found
                    if !err.contains("not found") {
                        eprintln!("Error terminating {}: {}", process_name, err);
                    }
                }
            }
            Err(e) => eprintln!("Failed to execute taskkill: {}", e),
        }
    }
    
    #[cfg(target_os = "macos")]
    #[cfg(target_os = "linux")]
    {
        // macOS/Linux: use pkill
        let output = Command::new("pkill")
            .arg("-f")
            .arg(process_name)
            .output();
        
        match output {
            Ok(o) => {
                // pkill returns 0 if processes were killed, 1 if no matching processes were found
                if o.status.success() {
                    println!("Successfully terminated {} processes", process_name);
                } else if o.status.code() == Some(1) {
                    println!("No {} processes found to terminate", process_name);
                } else {
                    eprintln!("Error terminating {}: {}", process_name, 
                             String::from_utf8_lossy(&o.stderr));
                }
            }
            Err(e) => eprintln!("Failed to execute pkill: {}", e),
        }
    }
}

// Function to kill process using a specific port
fn kill_process_by_port(port: u16) {
    println!("Attempting to kill any process using port {}...", port);
    
    #[cfg(target_os = "windows")]
    {
        // First find the PID
        let output = Command::new("netstat")
            .args(&["-ano", "|", "findstr", &format!(":{}", port)])
            .output();
            
        match output {
            Ok(o) => {
                let output_str = String::from_utf8_lossy(&o.stdout);
                // Parse the output to find PID
                for line in output_str.lines() {
                    if line.contains(&format!(":{}", port)) {
                        // The PID is the last column in the output
                        if let Some(pid) = line.split_whitespace().last() {
                            // Kill the process with the PID
                            let _ = Command::new("taskkill")
                                .args(&["/F", "/PID", pid])
                                .output();
                            println!("Killed process with PID {} on port {}", pid, port);
                        }
                    }
                }
            }
            Err(e) => eprintln!("Failed to execute netstat: {}", e),
        }
    }
    
    #[cfg(target_os = "macos")]
    {
        // First find the PID
        let output = Command::new("lsof")
            .args(&["-i", &format!("tcp:{}", port)])
            .output();
            
        match output {
            Ok(o) => {
                let output_str = String::from_utf8_lossy(&o.stdout);
                // Parse the output to find PID (second column)
                for line in output_str.lines().skip(1) { // Skip header
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let pid = parts[1];
                        // Kill the process with the PID
                        let _ = Command::new("kill")
                            .args(&["-9", pid])
                            .output();
                        println!("Killed process with PID {} on port {}", pid, port);
                    }
                }
            }
            Err(e) => eprintln!("Failed to execute lsof: {}", e),
        }
    }
    
    #[cfg(target_os = "linux")]
    {
        // First find the PID
        let output = Command::new("lsof")
            .args(&["-i", &format!(":{}", port)])
            .output();
            
        match output {
            Ok(o) => {
                let output_str = String::from_utf8_lossy(&o.stdout);
                // Parse the output to find PID (second column)
                for line in output_str.lines().skip(1) { // Skip header
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        let pid = parts[1];
                        // Kill the process with the PID
                        let _ = Command::new("kill")
                            .args(&["-9", pid])
                            .output();
                        println!("Killed process with PID {} on port {}", pid, port);
                    }
                }
            }
            Err(e) => eprintln!("Failed to execute lsof: {}", e),
        }
    }
}

// Cleanup function that kills all relevant processes
fn cleanup_existing_processes() {
    println!("Cleaning up any existing processes...");
    
    // Kill processes by name
    kill_process_by_name("operator");
    kill_process_by_name("orchestrator");
    
    // Kill processes by port
    kill_process_by_port(4688);
    kill_process_by_port(4689);
    
    // Wait a moment to ensure processes have time to terminate
    std::thread::sleep(Duration::from_millis(1000));
    println!("Cleanup completed");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize states to store the child processes
    let operator_state: Mutex<Option<CommandChild>> = Mutex::new(None);
    let orchestrator_state: Mutex<Option<CommandChild>> = Mutex::new(None);

    // First, clean up any existing processes
    cleanup_existing_processes();

    tauri::Builder::default()
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
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Store our child states in the app state
            app.manage(operator_state);
            app.manage(orchestrator_state);
            
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
                // Start the sidecars when the app is fully ready
                let app_handle_clone = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    // Wait a short time to ensure any previous instances have completely terminated
                    std::thread::sleep(Duration::from_millis(500));
                    
                    // First start orchestrator sidecar
                    match app_handle_clone.shell().sidecar("orchestrator") {
                        Ok(sidecar) => {
                            match sidecar.spawn() {
                                Ok((mut rx, child)) => {
                                    // Store the child process so we can terminate it later
                                    let orchestrator_state = app_handle_clone.state::<Mutex<Option<CommandChild>>>();
                                    *orchestrator_state.lock().unwrap() = Some(child);
                                    
                                    // Optionally handle the sidecar output
                                    tauri::async_runtime::spawn(async move {
                                        while let Some(event) = rx.recv().await {
                                            match event {
                                                CommandEvent::Stdout(line) => {
                                                    println!("Orchestrator output: {}", String::from_utf8_lossy(&line));
                                                },
                                                CommandEvent::Stderr(line) => {
                                                    eprintln!("Orchestrator output: {}", String::from_utf8_lossy(&line));
                                                },
                                                CommandEvent::Error(err) => {
                                                    eprintln!("Orchestrator process error: {}", err);
                                                },
                                                CommandEvent::Terminated(status) => {
                                                    println!("Orchestrator process terminated with status: {:?}", status);
                                                    
                                                    // If the process terminated unexpectedly, try to restart it
                                                    if status.code.unwrap_or(-1) != 0 {
                                                        println!("Attempting to restart orchestrator...");
                                                        // Add restart logic here if needed
                                                    }
                                                },
                                                _ => {}
                                            }
                                        }
                                    });
                                    
                                    println!("Successfully started orchestrator sidecar");
                                }
                                Err(e) => eprintln!("Failed to spawn orchestrator sidecar: {}", e),
                            }
                        }
                        Err(e) => eprintln!("Failed to create orchestrator sidecar: {}", e),
                    }
                    
                    // Wait a bit before starting the operator to ensure orchestrator is ready
                    std::thread::sleep(Duration::from_millis(500));
                    
                    // Then start operator sidecar
                    match app_handle_clone.shell().sidecar("operator") {
                        Ok(sidecar) => {
                            match sidecar.spawn() {
                                Ok((mut rx, child)) => {
                                    // Store the child process so we can terminate it later
                                    let operator_state = app_handle_clone.state::<Mutex<Option<CommandChild>>>();
                                    *operator_state.lock().unwrap() = Some(child);
                                    
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
                // Make sure to terminate both sidecar processes
                // First terminate operator
                let operator_state = app_handle.state::<Mutex<Option<CommandChild>>>();
                println!("Terminating operator sidecar...");
                
                {
                    let mut lock = operator_state.lock().unwrap();
                    if let Some(child) = lock.take() {
                        let _ = child.kill();
                    }
                } // lock is dropped here
                
                // Then terminate orchestrator
                let orchestrator_state = app_handle.state::<Mutex<Option<CommandChild>>>();
                println!("Terminating orchestrator sidecar...");
                
                {
                    let mut lock = orchestrator_state.lock().unwrap();
                    if let Some(child) = lock.take() {
                        let _ = child.kill();
                    }
                } // lock is dropped here
            },
            _ => {}
        });
}