// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::process::Command;
use std::thread;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

fn get_orchestrator_binary_path() -> String {
    // Detect the current platform
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    // Map the platform to the appropriate binary path
    match (os, arch) {
        // Windows platforms
        ("windows", "x86_64") => "bin\\orchestrator\\agentkube-orchestrator-x86_64-pc-windows-msvc.exe".to_string(),
        ("windows", "x86") => "bin\\orchestrator\\agentkube-orchestrator-i686-pc-windows-msvc.exe".to_string(),
        ("windows", "aarch64") => "bin\\orchestrator\\agentkube-orchestrator-aarch64-pc-windows-msvc.exe".to_string(),
        
        // macOS platforms
        ("macos", "x86_64") => "/Applications/Agentkube.app/Contents/Resources/bin/orchestrator/agentkube-orchestrator-x86_64-apple-darwin".to_string(),
        ("macos", "aarch64") => "/Applications/Agentkube.app/Contents/Resources/bin/orchestrator/agentkube-orchestrator-aarch64-apple-darwin".to_string(),
        
        // Linux platforms
        ("linux", "x86_64") => "bin/orchestrator/agentkube-orchestrator-x86_64-unknown-linux-gnu".to_string(),
        ("linux", "aarch64") => "bin/orchestrator/agentkube-orchestrator-aarch64-unknown-linux-gnu".to_string(),
        
        // Fallback
        _ => {
            log::warn!("Unsupported platform: {}-{}, using fallback binary path", os, arch);
            if os == "windows" {
                "bin\\orchestrator\\orchestrator.exe".to_string()
            } else {
                "bin/orchestrator/orchestrator".to_string()
            }
        }
    }
}

fn get_operator_binary_path() -> String {
    // Detect the current platform
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    // Map the platform to the appropriate binary path
    match (os, arch) {
        // Windows platforms
        ("windows", "x86_64") => "bin\\operator\\agentkube-operator-x86_64-pc-windows-msvc.exe".to_string(),
        ("windows", "x86") => "bin\\operator\\agentkube-operator-i686-pc-windows-msvc.exe".to_string(),
        ("windows", "aarch64") => "bin\\operator\\agentkube-operator-aarch64-pc-windows-msvc.exe".to_string(),
        
        // macOS platforms
        ("macos", "x86_64") => "/Applications/Agentkube.app/Contents/Resources/bin/operator/agentkube-operator-x86_64-apple-darwin".to_string(),
        ("macos", "aarch64") => "/Applications/Agentkube.app/Contents/Resources/bin/operator/agentkube-operator-aarch64-apple-darwin".to_string(),
        
        // Linux platforms
        ("linux", "x86_64") => "bin/operator/agentkube-operator-x86_64-unknown-linux-gnu".to_string(),
        ("linux", "aarch64") => "bin/operator/agentkube-operator-aarch64-unknown-linux-gnu".to_string(),
        
        // Fallback
        _ => {
            log::warn!("Unsupported platform: {}-{}, using fallback binary path", os, arch);
            if os == "windows" {
                "bin\\operator\\operator.exe".to_string()
            } else {
                "bin/operator/operator".to_string()
            }
        }
    }
}

fn get_log_directory() -> std::path::PathBuf {
    // Get platform-specific log directory that matches Tauri's location
    if cfg!(target_os = "macos") {
        dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("Library")
            .join("Logs")
            .join("platform.agentkube.app")
    } else if cfg!(target_os = "windows") {
        dirs::config_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("platform.agentkube.app")
            .join("logs")
    } else {
        // Linux
        dirs::config_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join("platform.agentkube.app")
            .join("logs")
    }
}

fn get_comprehensive_path() -> String {
    // Common PATH locations on macOS
    let mut path_candidates = vec![
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(), 
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
        "/usr/local/sbin".to_string(),
        "/opt/homebrew/sbin".to_string(),
        "/usr/local/go/bin".to_string(),
    ];
    
    // Add user-specific paths if HOME is available
    if let Ok(home) = std::env::var("HOME") {
        path_candidates.push(format!("{}/go/bin", home));
        path_candidates.push(format!("{}/.cargo/bin", home));
        path_candidates.push(format!("{}/.local/bin", home));
        path_candidates.push(format!("{}/bin", home));
        path_candidates.push(format!("{}/.npm-global/bin", home));
    }
    
    // Get existing PATH and split it
    let existing_path = std::env::var("PATH").unwrap_or_default();
    let mut all_paths = Vec::new();
    
    // Add existing PATH entries first
    if !existing_path.is_empty() {
        all_paths.extend(existing_path.split(':').map(|s| s.to_string()));
    }
    
    // Add our candidates that actually exist
    for path in &path_candidates {
        if std::path::Path::new(path).exists() && !all_paths.contains(path) {
            all_paths.push(path.clone());
        }
    }
    
    all_paths.join(":")
}

fn spawn_hidden_process(binary_path: &str, log_name: &str) -> Result<std::process::Child, std::io::Error> {
    let mut cmd = Command::new(binary_path);
    
    // Create log directory if it doesn't exist
    let log_dir = get_log_directory();
    if let Err(e) = std::fs::create_dir_all(&log_dir) {
        log::warn!("Failed to create log directory: {}", e);
    }
    
    // Set up log files for stdout and stderr
    let stdout_log = log_dir.join(format!("{}.log", log_name));
    let stderr_log = log_dir.join(format!("{}-error.log", log_name));
    
    let stdout_file = std::fs::File::create(&stdout_log)?;
    let stderr_file = std::fs::File::create(&stderr_log)?;
    
    cmd.stdout(stdout_file);
    cmd.stderr(stderr_file);
    
    // Set comprehensive PATH environment
    let comprehensive_path = get_comprehensive_path();
    cmd.env("PATH", &comprehensive_path);
    
    // Set other essential environment variables
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    if let Ok(user) = std::env::var("USER") {
        cmd.env("USER", user);
    }
    if let Ok(shell) = std::env::var("SHELL") {
        cmd.env("SHELL", shell);
    }
    
    log::info!("Binary logs will be written to: {} and {}", 
               stdout_log.display(), stderr_log.display());
    log::info!("Setting comprehensive PATH for {}: {}", log_name, comprehensive_path);
    
    #[cfg(windows)]
    {
        // On Windows, use CREATE_NO_WINDOW flag to hide console windows
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    cmd.spawn()
}

fn main() {
    // Initialize logging first
    log::info!("Agentkube application starting...");
    
    // Start the orchestrator binary
    log::info!("Starting orchestrator...");

    // Get the appropriate binary path for this platform
    let orchestrator_path = get_orchestrator_binary_path();
    log::info!("Using orchestrator binary: {}", orchestrator_path);

    // Spawn orchestrator as a standalone process (hidden on Windows)
    let mut orchestrator_handle = None;
    match spawn_hidden_process(&orchestrator_path, "orchestrator") {
        Ok(child) => {
            log::info!("Orchestrator started with PID: {:?}", child.id());
            orchestrator_handle = Some(child);
        }
        Err(e) => {
            log::error!("Failed to start orchestrator: {}", e);
        }
    }

    // Give the orchestrator some time to initialize
    log::info!("Waiting for orchestrator to initialize...");
    thread::sleep(Duration::from_millis(10000));

    // Start the operator binary next
    log::info!("Starting operator...");

    // Get the appropriate binary path for this platform
    let operator_path = get_operator_binary_path();
    log::info!("Using operator binary: {}", operator_path);

    // Spawn operator as a standalone process (hidden on Windows)
    let mut operator_handle = None;
    match spawn_hidden_process(&operator_path, "operator") {
        Ok(child) => {
            log::info!("Operator started with PID: {:?}", child.id());
            operator_handle = Some(child);
        }
        Err(e) => {
            log::error!("Failed to start operator: {}", e);
        }
    }

    // Give the operator some time to initialize
    log::info!("Waiting for operator to initialize...");
    thread::sleep(Duration::from_millis(1000));

    // Setup cleanup on application exit
    let original_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        // Call the original hook
        original_hook(panic_info);

        // Clean up processes if needed
        log::error!("Application panic occurred: {}", panic_info);
        log::info!("Cleaning up external processes...");
    }));

    // Then start the Tauri application
    log::info!("Starting Tauri application...");
    app_lib::run();

    // This code will run when Tauri application exits
    log::info!("Application exiting, cleaning up processes...");

    // Clean up operator if it's still running
    if let Some(mut child) = operator_handle {
        log::info!("Terminating operator process...");
        if let Err(e) = child.kill() {
            log::error!("Failed to kill operator process: {}", e);
        } else {
            log::info!("Operator process terminated successfully");
        }
    }

    // Clean up orchestrator if it's still running
    if let Some(mut child) = orchestrator_handle {
        log::info!("Terminating orchestrator process...");
        if let Err(e) = child.kill() {
            log::error!("Failed to kill orchestrator process: {}", e);
        } else {
            log::info!("Orchestrator process terminated successfully");
        }
    }
    
    log::info!("Agentkube application shutdown complete");
}