// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::process::Command;
use std::thread;
use std::time::Duration;
// use tauri::path::BaseDirectory;


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
            eprintln!("Unsupported platform: {}-{}", os, arch);
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
            eprintln!("Unsupported platform: {}-{}", os, arch);
            if os == "windows" {
                "bin\\operator\\operator.exe".to_string()
            } else {
                "bin/operator/operator".to_string()
            }
        }
    }
}

fn main() {
    // Start the orchestrator binary
    println!("Starting orchestrator...");
    
    // Get the appropriate binary path for this platform
    let orchestrator_path = get_orchestrator_binary_path();
    println!("Using orchestrator binary: {}", orchestrator_path);
    
    // Spawn orchestrator as a standalone process
    let mut orchestrator_handle = None;
    match Command::new(orchestrator_path).spawn() {
        Ok(child) => {
            println!("Orchestrator started with PID: {:?}", child.id());
            orchestrator_handle = Some(child);
        }
        Err(e) => {
            eprintln!("Failed to start orchestrator: {}", e);
        }
    }
    
    // Give the orchestrator some time to initialize
    println!("Waiting for orchestrator to initialize...");
    thread::sleep(Duration::from_millis(10000));
    
    // Start the operator binary next
    println!("Starting operator...");
    
    // Get the appropriate binary path for this platform
    let operator_path = get_operator_binary_path();
    println!("Using operator binary: {}", operator_path);
    
    // Spawn operator as a standalone process
    let mut operator_handle = None;
    match Command::new(operator_path).spawn() {
        Ok(child) => {
            println!("Operator started with PID: {:?}", child.id());
            operator_handle = Some(child);
        }
        Err(e) => {
            eprintln!("Failed to start operator: {}", e);
        }
    }
    
    // Give the operator some time to initialize
    println!("Waiting for operator to initialize...");
    thread::sleep(Duration::from_millis(1000));
    
    // Setup cleanup on application exit
    let original_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        // Call the original hook
        original_hook(panic_info);
        
        // Clean up processes if needed
        println!("Cleaning up external processes...");
    }));
    
    // Then start the Tauri application
    println!("Starting Tauri application...");
    app_lib::run();
    
    // This code will run when Tauri application exits
    println!("Application exiting, cleaning up processes...");
    
    // Clean up operator if it's still running
    if let Some(mut child) = operator_handle {
        println!("Terminating operator process...");
        if let Err(e) = child.kill() {
            eprintln!("Failed to kill operator process: {}", e);
        }
    }
    
    // Clean up orchestrator if it's still running
    if let Some(mut child) = orchestrator_handle {
        println!("Terminating orchestrator process...");
        if let Err(e) = child.kill() {
            eprintln!("Failed to kill orchestrator process: {}", e);
        }
    }
}