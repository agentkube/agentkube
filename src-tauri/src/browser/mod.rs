use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{
    webview::PageLoadEvent, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url,
    WebviewUrl, WebviewWindowBuilder,
};

/// Represents a browser session with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserSession {
    pub id: String,
    pub label: String,
    pub current_url: String,
    pub title: String,
    pub is_loading: bool,
}

/// Event payload for browser URL changes - sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserUrlChangedEvent {
    pub session_id: String,
    pub url: String,
}

/// Event payload for browser loading state changes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserLoadingEvent {
    pub session_id: String,
    pub is_loading: bool,
}

/// Manages all browser webview sessions
pub struct BrowserManager {
    sessions: HashMap<String, BrowserSession>,
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    pub fn add_session(&mut self, session: BrowserSession) {
        self.sessions.insert(session.id.clone(), session);
    }

    pub fn remove_session(&mut self, id: &str) -> Option<BrowserSession> {
        self.sessions.remove(id)
    }

    #[allow(dead_code)]
    pub fn list_sessions(&self) -> Vec<BrowserSession> {
        self.sessions.values().cloned().collect()
    }

    #[allow(dead_code)]
    pub fn update_url(&mut self, id: &str, url: String) {
        if let Some(session) = self.sessions.get_mut(id) {
            session.current_url = url;
        }
    }
}

pub type BrowserManagerState = Arc<Mutex<BrowserManager>>;

/// Creates a new browser webview window
#[tauri::command]
pub async fn create_browser_webview(
    app: AppHandle,
    state: tauri::State<'_, BrowserManagerState>,
    session_id: String,
    initial_url: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<BrowserSession, String> {
    log::info!(
        "Creating browser webview: {} at ({}, {}) size {}x{}",
        session_id,
        x,
        y,
        width,
        height
    );

    // Only create webview if we have a URL
    let url = match initial_url.clone() {
        Some(u) if !u.is_empty() => u,
        _ => return Err("No URL provided".to_string()),
    };
    let label = format!("browser-{}", session_id);

    // Parse the URL
    let webview_url = WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?);

    let session_id_for_nav = session_id.clone();
    let session_id_for_load = session_id.clone();
    let app_for_load = app.clone();

    // Get main window to set as parent
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    // Create browser window as child of main window
    let _webview_window = WebviewWindowBuilder::new(&app, &label, webview_url)
        .title("Browser")
        .inner_size(width, height)
        .position(x, y)
        .decorations(false)
        .visible(true)
        .resizable(false)
        .skip_taskbar(true)
        .parent(&main_window)
        .map_err(|e| format!("Failed to set parent: {}", e))?
        .on_navigation(move |nav_url| {
            log::info!("Browser {} navigating to: {}", session_id_for_nav, nav_url);
            true // Allow all navigation
        })
        .on_page_load(move |_webview, payload| {
            let url = payload.url().to_string();
            let sid = session_id_for_load.clone();

            match payload.event() {
                PageLoadEvent::Started => {
                    log::info!("Browser {} started loading: {}", sid, url);
                    let _ = app_for_load.emit(
                        "browser-loading",
                        BrowserLoadingEvent {
                            session_id: sid,
                            is_loading: true,
                        },
                    );
                }
                PageLoadEvent::Finished => {
                    log::info!("Browser {} finished loading: {}", sid, url);
                    // Emit URL change event to frontend
                    let _ = app_for_load.emit(
                        "browser-url-changed",
                        BrowserUrlChangedEvent {
                            session_id: sid.clone(),
                            url: url.clone(),
                        },
                    );
                    let _ = app_for_load.emit(
                        "browser-loading",
                        BrowserLoadingEvent {
                            session_id: sid,
                            is_loading: false,
                        },
                    );
                }
            }
        })
        .build()
        .map_err(|e| format!("Failed to create browser window: {}", e))?;

    // Create session info
    let session = BrowserSession {
        id: session_id.clone(),
        label: label.clone(),
        current_url: initial_url.unwrap_or_default(),
        title: String::new(),
        is_loading: true,
    };

    // Store in state
    {
        let mut manager = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.add_session(session.clone());
    }

    log::info!("Browser webview created: {}", label);
    Ok(session)
}

/// Navigate the browser to a specific URL
#[tauri::command]
pub async fn browser_navigate(
    app: AppHandle,
    session_id: String,
    url: String,
) -> Result<(), String> {
    log::info!("Browser {} navigating to: {}", session_id, url);

    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    let parsed_url: Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    webview_window
        .navigate(parsed_url)
        .map_err(|e| format!("Navigation failed: {}", e))?;

    Ok(())
}

/// Go back in browser history
#[tauri::command]
pub async fn browser_go_back(app: AppHandle, session_id: String) -> Result<(), String> {
    log::info!("Browser {} going back", session_id);

    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview_window
        .eval("window.history.back()")
        .map_err(|e| format!("Failed to go back: {}", e))?;

    Ok(())
}

/// Go forward in browser history
#[tauri::command]
pub async fn browser_go_forward(app: AppHandle, session_id: String) -> Result<(), String> {
    log::info!("Browser {} going forward", session_id);

    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview_window
        .eval("window.history.forward()")
        .map_err(|e| format!("Failed to go forward: {}", e))?;

    Ok(())
}

/// Reload the browser page
#[tauri::command]
pub async fn browser_reload(app: AppHandle, session_id: String) -> Result<(), String> {
    log::info!("Browser {} reloading", session_id);

    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview_window
        .eval("window.location.reload()")
        .map_err(|e| format!("Failed to reload: {}", e))?;

    Ok(())
}

/// Update browser window position and size
#[tauri::command]
pub async fn update_browser_bounds(
    app: AppHandle,
    session_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview_window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))?;

    webview_window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {}", e))?;

    Ok(())
}

/// Show browser window
#[tauri::command]
pub async fn show_browser_webview(app: AppHandle, session_id: String) -> Result<(), String> {
    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview_window
        .show()
        .map_err(|e| format!("Failed to show: {}", e))?;

    Ok(())
}

/// Hide browser window
#[tauri::command]
pub async fn hide_browser_webview(app: AppHandle, session_id: String) -> Result<(), String> {
    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview_window
        .hide()
        .map_err(|e| format!("Failed to hide: {}", e))?;

    Ok(())
}

/// Close browser window
#[tauri::command]
pub async fn close_browser_webview(
    app: AppHandle,
    state: tauri::State<'_, BrowserManagerState>,
    session_id: String,
) -> Result<(), String> {
    log::info!("Closing browser: {}", session_id);

    let label = format!("browser-{}", session_id);
    if let Some(webview_window) = app.get_webview_window(&label) {
        let _ = webview_window.close();
    }

    {
        let mut manager = state.lock().map_err(|e| format!("Lock error: {}", e))?;
        manager.remove_session(&session_id);
    }

    Ok(())
}

/// Get current URL from browser
#[tauri::command]
pub async fn get_browser_url(app: AppHandle, session_id: String) -> Result<String, String> {
    let label = format!("browser-{}", session_id);
    let webview_window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    let url = webview_window
        .url()
        .map_err(|e| format!("Failed to get URL: {}", e))?;
    Ok(url.to_string())
}
