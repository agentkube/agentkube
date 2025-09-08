use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStatus {
    pub online: bool,
}

impl Default for NetworkStatus {
    fn default() -> Self {
        Self { online: true }
    }
}

pub struct NetworkMonitor {
    status: Arc<Mutex<NetworkStatus>>,
    app_handle: AppHandle,
}

impl NetworkMonitor {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            status: Arc::new(Mutex::new(NetworkStatus::default())),
            app_handle,
        }
    }

    pub fn get_status(&self) -> NetworkStatus {
        self.status.lock().unwrap().clone()
    }

    fn update_status(&self, online: bool) {
        let mut status = self.status.lock().unwrap();
        if status.online != online {
            status.online = online;
            let new_status = status.clone();
            drop(status); // Release lock before emitting
            
            let _ = self.app_handle.emit("network-status-changed", &new_status);
            log::info!("Network status changed: online={}", online);
        }
    }

    pub async fn start_monitoring(&self) {
        log::info!("Starting network monitoring with OS-level events...");
        
        // Initial check
        let initial_status = self.check_connectivity().await;
        self.update_status(initial_status);

        // Start OS-specific monitoring
        #[cfg(target_os = "macos")]
        {
            self.start_macos_monitoring().await;
        }

        #[cfg(target_os = "linux")]
        {
            self.start_linux_monitoring().await;
        }

        // #[cfg(target_os = "windows")]
        // {
        //     self.start_windows_monitoring().await;
        // }
    }

    async fn check_connectivity(&self) -> bool {
        // Quick connectivity check
        match reqwest::Client::new()
            .get("https://1.1.1.1")
            .timeout(std::time::Duration::from_secs(3))
            .send()
            .await
        {
            Ok(_) => true,
            Err(_) => false,
        }
    }
}

// macOS implementation - simplified polling approach for now
#[cfg(target_os = "macos")]
impl NetworkMonitor {
    async fn start_macos_monitoring(&self) {
        let self_clone = Arc::new(self.clone());
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(3));
            let mut last_status = true;
            
            loop {
                interval.tick().await;
                let current_status = self_clone.check_connectivity().await;
                
                if current_status != last_status {
                    self_clone.update_status(current_status);
                    last_status = current_status;
                }
            }
        });
    }
}

// Linux implementation using NetworkManager D-Bus
#[cfg(target_os = "linux")]
impl NetworkMonitor {
    async fn start_linux_monitoring(&self) {
        let self_clone = Arc::new(self.clone());
        
        tokio::spawn(async move {
            match zbus::Connection::system().await {
                Ok(connection) => {
                    match zbus::proxy::ProxyBuilder::new(&connection)
                        .interface("org.freedesktop.NetworkManager")
                        .path("/org/freedesktop/NetworkManager")
                        .build()
                        .await
                    {
                        Ok(proxy) => {
                            if let Ok(mut stream) = proxy.receive_signal("StateChanged").await {
                                while let Some(signal) = stream.next().await {
                                    if let Ok(args) = signal.body::<(u32,)>() {
                                        let state = args.0;
                                        // NetworkManager states: 20=DISCONNECTED, 70=CONNECTED_GLOBAL
                                        let online = state >= 70;
                                        self_clone.update_status(online);
                                    }
                                }
                            }
                        }
                        Err(e) => log::error!("Failed to create NetworkManager proxy: {}", e),
                    }
                }
                Err(e) => log::error!("Failed to connect to D-Bus: {}", e),
            }
        });
    }
}

// Windows implementation using NetworkListManager (temporarily disabled)
// #[cfg(target_os = "windows")]
// impl NetworkMonitor {
//     async fn start_windows_monitoring(&self) {
//         // Will implement once we get the right Windows crate features
//         log::warn!("Windows network monitoring not yet implemented");
//     }
// }

// Implement Clone for NetworkMonitor (needed for Arc)
impl Clone for NetworkMonitor {
    fn clone(&self) -> Self {
        Self {
            status: Arc::clone(&self.status),
            app_handle: self.app_handle.clone(),
        }
    }
}