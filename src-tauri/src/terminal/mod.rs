use portable_pty::{CommandBuilder, NativePtySystem, PtyPair, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use tauri::State;
use uuid::Uuid;

/// Terminal session type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionType {
    Local,
    K8s {
        pod: String,
        container: String,
        namespace: String,
    },
}

/// Terminal session info returned to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSessionInfo {
    pub id: String,
    pub session_type: SessionType,
    pub name: String,
    pub created_at: u64,
}

/// Internal PTY session
struct PtySession {
    id: String,
    session_type: SessionType,
    name: String,
    created_at: u64,
    #[allow(dead_code)]
    pty_pair: PtyPair,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    output_receiver: mpsc::Receiver<Vec<u8>>,
    _reader_thread: thread::JoinHandle<()>,
}

/// Terminal session manager state
pub struct TerminalManager {
    sessions: HashMap<String, PtySession>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Global terminal manager state type for Tauri
pub type TerminalManagerState = Arc<Mutex<TerminalManager>>;

/// Get the default shell for the current platform
fn get_default_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

/// Create a new local terminal session
#[tauri::command]
pub async fn create_local_shell(
    state: State<'_, TerminalManagerState>,
    name: Option<String>,
    cols: Option<u16>,
    rows: Option<u16>,
    initial_command: Option<String>,
) -> Result<TerminalSessionInfo, String> {
    let pty_system = NativePtySystem::default();

    let size = PtySize {
        rows: rows.unwrap_or(24),
        cols: cols.unwrap_or(80),
        pixel_width: 0,
        pixel_height: 0,
    };

    let pty_pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let shell = get_default_shell();
    let mut cmd = CommandBuilder::new(&shell);

    // Set up environment
    #[cfg(not(target_os = "windows"))]
    {
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        // Add shell-specific initialization for interactive mode
        if shell.contains("zsh") {
            cmd.args(["-i"]);
        } else if shell.contains("bash") {
            cmd.args(["--login", "-i"]);
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Windows-specific setup
        cmd.env("TERM", "xterm-256color");
    }

    let _child = pty_pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    let mut reader = pty_pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;

    let writer = pty_pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let writer = Arc::new(Mutex::new(writer));

    let session_id = Uuid::new_v4().to_string();
    let session_id_clone = session_id.clone();
    let created_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let session_name = name.unwrap_or_else(|| format!("Terminal {}", &session_id[..6]));

    // Create a channel for PTY output
    let (output_sender, output_receiver) = mpsc::channel::<Vec<u8>>();

    // Spawn a background thread to read from PTY
    let reader_thread = thread::spawn(move || {
        let mut buffer = vec![0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF - PTY closed
                    log::debug!("PTY reader EOF for session {}", session_id_clone);
                    break;
                }
                Ok(n) => {
                    // Send the data to the channel
                    if output_sender.send(buffer[..n].to_vec()).is_err() {
                        // Receiver dropped, stop reading
                        log::debug!("PTY receiver dropped for session {}", session_id_clone);
                        break;
                    }
                }
                Err(e) => {
                    log::error!("Error reading from PTY: {}", e);
                    break;
                }
            }
        }
    });

    // If an initial command was provided, write it to the PTY after a short delay
    if let Some(command) = initial_command {
        let writer_clone = Arc::clone(&writer);
        thread::spawn(move || {
            // Wait for shell to initialize
            thread::sleep(std::time::Duration::from_millis(500));

            if let Ok(mut w) = writer_clone.lock() {
                // Write the command followed by newline
                let cmd_with_newline = format!("{}\n", command);
                if let Err(e) = w.write_all(cmd_with_newline.as_bytes()) {
                    log::error!("Failed to write initial command: {}", e);
                }
                let _ = w.flush();
            }
        });
    }

    let session = PtySession {
        id: session_id.clone(),
        session_type: SessionType::Local,
        name: session_name.clone(),
        created_at,
        pty_pair,
        writer,
        output_receiver,
        _reader_thread: reader_thread,
    };

    let session_info = TerminalSessionInfo {
        id: session_id.clone(),
        session_type: SessionType::Local,
        name: session_name,
        created_at,
    };

    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;
    manager.sessions.insert(session_id, session);

    log::info!("Created local terminal session: {}", session_info.id);

    Ok(session_info)
}

/// Write data to a terminal session
#[tauri::command]
pub async fn write_to_pty(
    state: State<'_, TerminalManagerState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = manager
        .sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    let mut writer = session
        .writer
        .lock()
        .map_err(|e| format!("Failed to lock writer: {}", e))?;

    writer
        .write_all(data.as_bytes())
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;

    writer
        .flush()
        .map_err(|e| format!("Failed to flush PTY: {}", e))?;

    Ok(())
}

/// Read data from a terminal session (non-blocking)
#[tauri::command]
pub async fn read_from_pty(
    state: State<'_, TerminalManagerState>,
    session_id: String,
) -> Result<String, String> {
    let manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = manager
        .sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Try to receive all available data without blocking
    let mut output = Vec::new();

    // Use try_recv to get data without blocking
    loop {
        match session.output_receiver.try_recv() {
            Ok(data) => {
                output.extend(data);
            }
            Err(mpsc::TryRecvError::Empty) => {
                // No more data available
                break;
            }
            Err(mpsc::TryRecvError::Disconnected) => {
                // Channel closed, PTY died
                if output.is_empty() {
                    return Err("PTY session closed".to_string());
                }
                break;
            }
        }
    }

    if output.is_empty() {
        return Ok(String::new());
    }

    // Convert to string, handling potential invalid UTF-8
    String::from_utf8(output).or_else(|e| {
        // If there's invalid UTF-8, convert lossy
        Ok(String::from_utf8_lossy(e.as_bytes()).to_string())
    })
}

/// Resize a terminal session
#[tauri::command]
pub async fn resize_pty(
    state: State<'_, TerminalManagerState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = manager
        .sessions
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    session
        .pty_pair
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))?;

    log::debug!(
        "Resized terminal session {} to {}x{}",
        session_id,
        cols,
        rows
    );

    Ok(())
}

/// Close a terminal session
#[tauri::command]
pub async fn close_session(
    state: State<'_, TerminalManagerState>,
    session_id: String,
) -> Result<(), String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    if manager.sessions.remove(&session_id).is_some() {
        log::info!("Closed terminal session: {}", session_id);
        Ok(())
    } else {
        Err(format!("Session not found: {}", session_id))
    }
}

/// Get all terminal sessions
#[tauri::command]
pub async fn get_all_sessions(
    state: State<'_, TerminalManagerState>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    let manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let sessions: Vec<TerminalSessionInfo> = manager
        .sessions
        .values()
        .map(|s| TerminalSessionInfo {
            id: s.id.clone(),
            session_type: s.session_type.clone(),
            name: s.name.clone(),
            created_at: s.created_at,
        })
        .collect();

    Ok(sessions)
}

/// Rename a terminal session
#[tauri::command]
pub async fn rename_session(
    state: State<'_, TerminalManagerState>,
    session_id: String,
    new_name: String,
) -> Result<(), String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session = manager
        .sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    session.name = new_name.clone();
    log::info!("Renamed terminal session {} to {}", session_id, new_name);

    Ok(())
}

/// Close all terminal sessions
#[tauri::command]
pub async fn close_all_sessions(state: State<'_, TerminalManagerState>) -> Result<(), String> {
    let mut manager = state
        .lock()
        .map_err(|e| format!("Failed to lock state: {}", e))?;

    let session_count = manager.sessions.len();
    manager.sessions.clear();

    log::info!("Closed {} terminal sessions", session_count);

    Ok(())
}

/// Launch an external terminal application
#[tauri::command]
pub async fn launch_external_terminal(
    terminal_type: String,
    working_directory: Option<String>,
    command: Option<String>,
) -> Result<(), String> {
    let cwd = working_directory.unwrap_or_else(|| {
        dirs::home_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string())
    });

    #[cfg(target_os = "macos")]
    {
        match terminal_type.as_str() {
            "iterm" | "iTerm" => {
                let script = if let Some(cmd) = command {
                    format!(
                        r#"tell application "iTerm"
                            create window with default profile
                            tell current session of current window
                                write text "cd {} && {}"
                            end tell
                        end tell"#,
                        cwd, cmd
                    )
                } else {
                    format!(
                        r#"tell application "iTerm"
                            create window with default profile
                            tell current session of current window
                                write text "cd {}"
                            end tell
                        end tell"#,
                        cwd
                    )
                };

                std::process::Command::new("osascript")
                    .args(["-e", &script])
                    .spawn()
                    .map_err(|e| format!("Failed to launch iTerm: {}", e))?;
            }
            "alacritty" => {
                let mut cmd = std::process::Command::new("open");
                cmd.args(["-a", "Alacritty", "--args", "--working-directory", &cwd]);
                if let Some(c) = command {
                    cmd.args(["-e", &c]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch Alacritty: {}", e))?;
            }
            _ => {
                // Default to Terminal.app
                let script = if let Some(cmd) = command {
                    format!(
                        r#"tell application "Terminal"
                            do script "cd {} && {}"
                            activate
                        end tell"#,
                        cwd, cmd
                    )
                } else {
                    format!(
                        r#"tell application "Terminal"
                            do script "cd {}"
                            activate
                        end tell"#,
                        cwd
                    )
                };

                std::process::Command::new("osascript")
                    .args(["-e", &script])
                    .spawn()
                    .map_err(|e| format!("Failed to launch Terminal: {}", e))?;
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        match terminal_type.as_str() {
            "alacritty" => {
                let mut cmd = std::process::Command::new("alacritty");
                cmd.args(["--working-directory", &cwd]);
                if let Some(c) = command {
                    cmd.args(["-e", "sh", "-c", &c]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch Alacritty: {}", e))?;
            }
            "gnome-terminal" => {
                let mut cmd = std::process::Command::new("gnome-terminal");
                cmd.args(["--working-directory", &cwd]);
                if let Some(c) = command {
                    cmd.args(["--", "sh", "-c", &c]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch GNOME Terminal: {}", e))?;
            }
            "konsole" => {
                let mut cmd = std::process::Command::new("konsole");
                cmd.args(["--workdir", &cwd]);
                if let Some(c) = command {
                    cmd.args(["-e", "sh", "-c", &c]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch Konsole: {}", e))?;
            }
            _ => {
                // Try xterm as fallback
                let mut cmd = std::process::Command::new("xterm");
                if let Some(c) = command {
                    cmd.args(["-e", &format!("cd {} && {}", cwd, c)]);
                } else {
                    cmd.args(["-e", &format!("cd {} && $SHELL", cwd)]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch xterm: {}", e))?;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        match terminal_type.as_str() {
            "windows-terminal" | "wt" => {
                let mut cmd = std::process::Command::new("wt.exe");
                cmd.args(["-d", &cwd]);
                if let Some(c) = command {
                    cmd.args(["cmd", "/c", &c]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch Windows Terminal: {}", e))?;
            }
            "powershell" => {
                let mut cmd = std::process::Command::new("powershell.exe");
                cmd.args(["-NoExit", "-Command", &format!("Set-Location '{}'", cwd)]);
                if let Some(c) = command {
                    cmd.args([";", &c]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch PowerShell: {}", e))?;
            }
            _ => {
                // Default to cmd
                let mut cmd = std::process::Command::new("cmd.exe");
                cmd.args(["/K", &format!("cd /d {}", cwd)]);
                if let Some(c) = command {
                    cmd.args(["&&", &c]);
                }
                cmd.spawn()
                    .map_err(|e| format!("Failed to launch cmd: {}", e))?;
            }
        }
    }

    Ok(())
}
