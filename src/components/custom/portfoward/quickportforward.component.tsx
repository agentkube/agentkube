import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { startPortForward, openPortForwardInBrowser } from '@/api/internal/portforward';

interface QuickPortForwardButtonProps {
  clusterName: string;
  namespace: string;
  serviceName: string;
  port: number | string;
  targetPort: number | string;
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const QuickPortForwardButton: React.FC<QuickPortForwardButtonProps> = ({
  clusterName,
  namespace,
  serviceName,
  port,
  targetPort,
  className = "",
  variant = "outline",
  size = "sm"
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);

    try {
      // Handle targetPort - convert to string for API call
      // If targetPort is a number, convert to string; if it's already a string (named port), keep it
      const targetPortString = targetPort.toString();
      
      const result = await startPortForward({
        namespace,
        pod: "", // This will be determined by the backend based on service
        service: serviceName,
        serviceNamespace: namespace,
        targetPort: targetPortString,
        cluster: clusterName
        // Don't specify port - let backend assign a random one
      });

      toast({
        title: "Port Forward Started",
        description: `Port ${port} forwarded to localhost:${result.port}`,
      });

      // Open the forwarded port in a new browser tab
      openPortForwardInBrowser(result.port?.toString() || '');
    } catch (error) {
      toast({
        title: "Port Forward Failed",
        description: error instanceof Error ? error.message : "Failed to start port forward",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ExternalLink className="h-4 w-4" />
      )}
    </Button>
  );
};

export default QuickPortForwardButton;