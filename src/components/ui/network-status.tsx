import React from 'react';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export const NetworkStatus: React.FC = () => {
  const { isOnline } = useNetworkStatus();

  return (
    <div className="flex items-center space-x-2 px-1 py-0 w-6 rounded-md">
      {!isOnline && (
        <WifiOff className="h-4 w-4 text-red-600 dark:text-red-500" />
      )}
    </div>
  );
};