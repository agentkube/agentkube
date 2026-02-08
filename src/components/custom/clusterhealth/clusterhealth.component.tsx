import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OPERATOR_URL } from '@/config';

interface ClusterHealthProps {
  clusterId: string;
  onHealthStatusChange?: (clusterId: string, status: 'ok' | 'bad_gateway' | 'loading') => void;
}

const ClusterHealth: React.FC<ClusterHealthProps> = ({ clusterId, onHealthStatusChange }) => {
  const [healthStatus, setHealthStatus] = useState<'ok' | 'bad_gateway' | 'loading'>('loading');

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${OPERATOR_URL}/clusters/${clusterId}/healthz`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        let newStatus: 'ok' | 'bad_gateway';
        if (response.status === 502) {
          newStatus = 'bad_gateway';
        } else if (response.ok) {
          newStatus = 'ok';
        } else {
          newStatus = 'bad_gateway';
        }
        
        setHealthStatus(newStatus);
        onHealthStatusChange?.(clusterId, newStatus);
      } catch (error) {
        setHealthStatus('bad_gateway');
        onHealthStatusChange?.(clusterId, 'bad_gateway');
      }
    };

    checkHealth();
  }, [clusterId, onHealthStatusChange]);

  if (healthStatus === 'ok' || healthStatus === 'loading') {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="absolute top-2 right-2 pointer-events-none">
            <AlertTriangle size={16} className="text-yellow-500 pointer-events-auto" />
          </div>
        </TooltipTrigger>
        <TooltipContent className="flex gap-1.5 items-center p-1 bg-destructive text-destructive-foreground">
        <AlertTriangle  className="h-3 w-3" />
          <p>Bad Gateway</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ClusterHealth;