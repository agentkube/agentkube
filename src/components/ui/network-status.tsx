import React from 'react';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export const NetworkStatus: React.FC = () => {
  const { isOnline } = useNetworkStatus();

  // When online, show nothing
  if (isOnline) {
    return null;
  }

  // When offline, show "No Internet" with WiFi off icon
  return (
    <div className="flex items-center space-x-2 px-2 py-1 rounded-md">
      <WifiOff className="h-4 w-4 text-red-600 dark:text-red-400" />
      <span className="text-xs font-medium text-red-700 dark:text-red-300">
        No Internet
      </span>
    </div>
  );
};