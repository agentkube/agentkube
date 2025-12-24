use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{
    webview::{PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, Webview, WebviewUrl,
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

/// Creates a new browser webview EMBEDDED in the main window
/// This uses WebviewBuilder with Window::add_child() for true embedding
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
        "Creating EMBEDDED browser webview: {} at ({}, {}) size {}x{}",
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

    // Parse the URL for WebviewUrl
    let parsed_url: Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    let webview_url = WebviewUrl::External(parsed_url);

    // Get main window - we will embed the webview inside it
    let main_window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    let session_id_for_nav = session_id.clone();
    let session_id_for_load = session_id.clone();
    let app_for_load = app.clone();

    // Create WebviewBuilder (not WebviewWindowBuilder!)
    let webview_builder = WebviewBuilder::new(&label, webview_url)
        .auto_resize()
        .on_navigation(move |nav_url| {
            log::info!("Browser {} navigating to: {}", session_id_for_nav, nav_url);
            true // Allow all navigation
        })
        .on_page_load(move |_webview: Webview, payload| {
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
        });

    // Add webview as a CHILD of the main window (truly embedded!)
    let _webview = main_window
        .add_child(
            webview_builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| format!("Failed to create embedded webview: {}", e))?;

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

    log::info!("Embedded browser webview created: {}", label);
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

    // Get the embedded webview from the main window
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    let parsed_url: Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
    webview
        .navigate(parsed_url)
        .map_err(|e| format!("Navigation failed: {}", e))?;

    Ok(())
}

/// Go back in browser history
#[tauri::command]
pub async fn browser_go_back(app: AppHandle, session_id: String) -> Result<(), String> {
    log::info!("Browser {} going back", session_id);

    let label = format!("browser-{}", session_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview
        .eval("window.history.back()")
        .map_err(|e| format!("Failed to go back: {}", e))?;

    Ok(())
}

/// Go forward in browser history
#[tauri::command]
pub async fn browser_go_forward(app: AppHandle, session_id: String) -> Result<(), String> {
    log::info!("Browser {} going forward", session_id);

    let label = format!("browser-{}", session_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview
        .eval("window.history.forward()")
        .map_err(|e| format!("Failed to go forward: {}", e))?;

    Ok(())
}

/// Reload the browser page
#[tauri::command]
pub async fn browser_reload(app: AppHandle, session_id: String) -> Result<(), String> {
    log::info!("Browser {} reloading", session_id);

    let label = format!("browser-{}", session_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview
        .eval("window.location.reload()")
        .map_err(|e| format!("Failed to reload: {}", e))?;

    Ok(())
}

/// Update browser webview position and size (for embedded webviews)
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
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    // For embedded webviews, set position and size relative to parent window
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("Failed to set position: {}", e))?;

    webview
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| format!("Failed to set size: {}", e))?;

    Ok(())
}

/// Show browser webview
#[tauri::command]
pub async fn show_browser_webview(app: AppHandle, session_id: String) -> Result<(), String> {
    let label = format!("browser-{}", session_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    webview
        .set_focus()
        .map_err(|e| format!("Failed to focus: {}", e))?;

    Ok(())
}

/// Hide browser webview (move it off-screen for embedded webviews)
#[tauri::command]
pub async fn hide_browser_webview(app: AppHandle, session_id: String) -> Result<(), String> {
    let label = format!("browser-{}", session_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    // Move off-screen to hide (embedded webviews don't have show/hide)
    webview
        .set_position(LogicalPosition::new(-10000.0, -10000.0))
        .map_err(|e| format!("Failed to hide: {}", e))?;

    Ok(())
}

/// Close browser webview
#[tauri::command]
pub async fn close_browser_webview(
    app: AppHandle,
    state: tauri::State<'_, BrowserManagerState>,
    session_id: String,
) -> Result<(), String> {
    log::info!("Closing browser: {}", session_id);

    let label = format!("browser-{}", session_id);
    if let Some(webview) = app.get_webview(&label) {
        let _ = webview.close();
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
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    let url = webview
        .url()
        .map_err(|e| format!("Failed to get URL: {}", e))?;
    Ok(url.to_string())
}

/// Set zoom level for browser webview
#[tauri::command]
pub async fn browser_set_zoom(
    app: AppHandle,
    session_id: String,
    zoom_level: f64,
) -> Result<(), String> {
    log::info!(
        "Browser {} setting zoom to: {}%",
        session_id,
        zoom_level * 100.0
    );

    let label = format!("browser-{}", session_id);
    let webview = app
        .get_webview(&label)
        .ok_or_else(|| format!("Browser {} not found", label))?;

    // Set zoom using CSS transform for better compatibility
    let zoom_script = format!("document.body.style.zoom = '{}';", zoom_level);

    webview
        .eval(&zoom_script)
        .map_err(|e| format!("Failed to set zoom: {}", e))?;

    Ok(())
}
