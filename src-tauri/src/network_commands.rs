use crate::network_monitor::{NetworkMonitor, NetworkStatus};
use std::sync::Arc;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

pub type NetworkMonitorState = Arc<Mutex<NetworkMonitor>>;

#[tauri::command]
pub async fn get_network_status(
    network_monitor: State<'_, NetworkMonitorState>,
) -> Result<NetworkStatus, String> {
    let monitor = network_monitor.lock().await;
    Ok(monitor.get_status())
}

#[tauri::command]
pub async fn start_network_monitoring(
    app_handle: AppHandle,
    _network_monitor: State<'_, NetworkMonitorState>,
) -> Result<(), String> {
    // Create a new monitor for the background task
    let monitor = NetworkMonitor::new(app_handle);
    
    // Spawn background monitoring task
    tokio::spawn(async move {
        monitor.start_monitoring().await;
    });

    Ok(())
}