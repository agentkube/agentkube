import React from 'react';
import { AlertCircle, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { installTrivyOperator } from '@/api/scanner/security';
import { useCluster } from '@/contexts/clusterContext';
import { openExternalUrl } from '@/api/external';

interface TrivyNotInstalledProps {
  title: string;
  subtitle: string;
  onInstallSuccess: () => void;
}

const TrivyNotInstalled: React.FC<TrivyNotInstalledProps> = ({ title, subtitle, onInstallSuccess }) => {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { currentContext } = useCluster();

  const handleInstallTrivy = async () => {
    if (!currentContext?.name) {
      setError("No cluster selected");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      await installTrivyOperator(currentContext.name);
      onInstallSuccess();
    } catch (err) {
      console.error('Installation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to install Trivy operator');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">{title}</h1>
      </div>

      <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
        <CardContent className="p-8">
          <div className="text-center py-12">
            <AlertCircle className="h-16 w-16 mx-auto text-blue-600 mb-4" />
            <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Trivy Operator Not Detected
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-lg mx-auto">
              {subtitle}
            </p>
            
            {error && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md">
                {error}
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={handleInstallTrivy}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? 'Installing...' : 'Install Trivy Operator'}
              </Button>
              <Button
                variant="outline"
                onClick={() => openExternalUrl('https://aquasecurity.github.io/trivy-operator/latest/getting-started/installation/')}
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
  );
};

export default TrivyNotInstalled;