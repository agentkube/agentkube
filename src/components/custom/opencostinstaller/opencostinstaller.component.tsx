import React, { useEffect, useState } from 'react';
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DollarSign, ExternalLink, Settings, Play } from "lucide-react";
import ProxyConfigDialog from '../proxyconfigdialog/proxyconfigdialog.component';
import DemoVideoDialog from '../demovideodialog/demovideodialog.component';
import OpenCostInstallDialog from './opencost-install-dialog.component';
import { openExternalUrl } from '@/api/external';
import { useCluster } from '@/contexts/clusterContext';
import { getClusterConfig, updateClusterConfig } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';
import { DEMO_VIDEOS } from '@/constants/demo.constants';


interface OpenCostInstallerProps {
  loading: boolean;
  onInstallSuccess: () => void;
}

const OpenCostInstaller: React.FC<OpenCostInstallerProps> = ({ loading, onInstallSuccess }) => {
  const { currentContext } = useCluster();
  const { toast } = useToast();
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [isWatchDemoExpanded, setIsWatchDemoExpanded] = useState(false);
  const [openCostConfig, setOpenCostConfig] = useState<{
    namespace: string;
    service: string;
  }>({
    namespace: 'opencost',
    service: 'opencost:9090'
  });

  const handleSaveConfig = async (config: { namespace: string; service: string }) => {
    if (!currentContext) return;

    setOpenCostConfig(config);

    try {
      // Map service to service_address for cluster configuration
      const clusterConfig = {
        namespace: config.namespace,
        service_address: config.service
      };

      // Save to cluster configuration
      await updateClusterConfig(currentContext.name, {
        opencost: clusterConfig
      });

      // Also save to localStorage for caching
      localStorage.setItem(`${currentContext.name}.openCostConfig`, JSON.stringify({
        externalConfig: {
          opencost: config
        }
      }));

      toast({
        title: "Configuration Saved",
        description: `OpenCost configured for cluster ${currentContext.name}`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to save OpenCost configuration",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const loadOpenCostConfig = async () => {
      if (!currentContext) return;

      try {
        let config = null;

        // First try to load from cluster configuration
        try {
          const clusterConfig = await getClusterConfig(currentContext.name);
          if (clusterConfig.opencost) {
            // Map service_address back to service for backwards compatibility
            config = {
              namespace: clusterConfig.opencost.namespace,
              service: clusterConfig.opencost.service_address || clusterConfig.opencost.service
            };
          }
        } catch (clusterErr) {
          // If cluster config fails, fallback to localStorage
          const savedConfig = localStorage.getItem(`${currentContext.name}.openCostConfig`);
          if (savedConfig) {
            const parsedConfig = JSON.parse(savedConfig);
            if (parsedConfig.externalConfig?.opencost) {
              config = parsedConfig.externalConfig.opencost;
            }
          }
        }

        if (config) {
          setOpenCostConfig(config);
        }
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to load OpenCost configuration",
          variant: "destructive",
        });
      }
    };

    loadOpenCostConfig();
  }, [currentContext, toast]);

  // Watch Demo button animation effect
  useEffect(() => {
    const expandTimer = setTimeout(() => {
      setIsWatchDemoExpanded(true);
    }, 500);

    const collapseTimer = setTimeout(() => {
      setIsWatchDemoExpanded(false);
    }, 3000); // 500ms + 2500ms = 3000ms total

    return () => {
      clearTimeout(expandTimer);
      clearTimeout(collapseTimer);
    };
  }, []);

  const handleInstallClick = () => {
    setIsInstallDialogOpen(true);
  };

  const handleInstallSuccess = () => {
    setIsInstallDialogOpen(false);
    onInstallSuccess();
  };


  return (
    <>
      <div className="p-6 mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-5xl text-muted-foreground font-[Anton] uppercase font-bold">Cost Overview</h1>

          <div className="flex gap-2 items-center">
            {/* Watch Demo Button */}
            <Button
              onClick={() => setIsDemoOpen(true)}
              className="flex items-center justify-between gap-2 relative overflow-hidden"
            >
              <motion.div
                initial={{ width: 40 }}
                animate={{
                  width: isWatchDemoExpanded ? 144 : 14
                }}
                transition={{
                  duration: 0.4,
                  ease: "easeInOut"
                }}
                className="flex items-center justify-between gap-2"
              >
                <Play className="w-4 h-4 flex-shrink-0" />
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{
                    opacity: isWatchDemoExpanded ? 1 : 0,
                    width: isWatchDemoExpanded ? 'auto' : 0
                  }}
                  transition={{
                    duration: 0.3,
                    delay: isWatchDemoExpanded ? 0.2 : 0,
                    ease: "easeOut"
                  }}
                  className="whitespace-nowrap text-sm overflow-hidden"
                >
                  Watch Demo
                </motion.span>
              </motion.div>
            </Button>

            {/* Settings Button */}
            <Button
              variant="outline"
              onClick={() => setIsConfigDialogOpen(true)}
              className="flex items-center gap-1"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ProxyConfigDialog
          isOpen={isConfigDialogOpen}
          onClose={() => setIsConfigDialogOpen(false)}
          onSave={handleSaveConfig}
          defaultConfig={openCostConfig}
          serviceName="OpenCost"
          defaultNamespace="opencost"
          defaultService="opencost:9090"
        />

        <Card className="bg-card border-border shadow-lg">
          <CardContent className="p-8">
            <div className="text-center py-12">
              <DollarSign className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-2xl font-semibold text-foreground mb-2">
                OpenCost Not Detected
              </h3>
              <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
                OpenCost helps you monitor and manage Kubernetes spending. Install it to get detailed cost breakdowns of your cluster resources, namespaces, and deployments.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={handleInstallClick}
                  disabled={loading}
                  className=""
                >
                  {loading ? 'Installing...' : 'Install OpenCost'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => openExternalUrl('https://opencost.io/docs/installation/install')}
                  className="flex items-center gap-1"
                >
                  <ExternalLink className="h-4 w-4" />
                  Learn More
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Install Dialog */}
      <OpenCostInstallDialog
        isOpen={isInstallDialogOpen}
        onClose={() => setIsInstallDialogOpen(false)}
        onInstallSuccess={handleInstallSuccess}
      />

      {/* Demo Dialog */}
      <DemoVideoDialog
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        videoUrl={DEMO_VIDEOS.COST_DEMO.videoUrl}
        title={DEMO_VIDEOS.COST_DEMO.title}
      />
    </>
  );
};

export default OpenCostInstaller;