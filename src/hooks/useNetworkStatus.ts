import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface NetworkStatus {
  online: boolean;
}

export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = useState(true);

  // Get current network status
  const getNetworkStatus = useCallback(async () => {
    try {
      const status: NetworkStatus = await invoke('get_network_status');
      setIsOnline(status.online);
    } catch (err) {
      console.error('Failed to get network status:', err);
    }
  }, []);

  // Start network monitoring
  const startNetworkMonitoring = useCallback(async () => {
    try {
      await invoke('start_network_monitoring');
    } catch (err) {
      console.error('Failed to start network monitoring:', err);
    }
  }, []);

  useEffect(() => {
    // Initial status check and start monitoring
    getNetworkStatus();
    startNetworkMonitoring();

    // Listen for network status changes
    const unlisten = listen<NetworkStatus>('network-status-changed', (event) => {
      setIsOnline(event.payload.online);
    });

    // Also listen for browser online/offline events as fallback
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      unlisten.then((unlistenFn) => unlistenFn());
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [getNetworkStatus, startNetworkMonitoring]);

  return { isOnline };
};