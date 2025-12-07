import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, Check, Shield, AlertCircle, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { addHelmRepository, installHelmRelease, getHelmActionStatus } from '@/api/internal/helm';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { SiTrivy } from '@icons-pack/react-simple-icons';

interface TrivyInstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallSuccess: () => void;
}

const TrivyInstallDialog: React.FC<TrivyInstallDialogProps> = ({ isOpen, onClose, onInstallSuccess }) => {
  const { currentContext } = useCluster();
  const { availableNamespaces } = useNamespace();

  // Installation form state
  const [releaseName, setReleaseName] = useState('trivy-operator');
  const [namespace, setNamespace] = useState('trivy-system');
  const [createNamespace, setCreateNamespace] = useState(true);
  const [customNamespace, setCustomNamespace] = useState('trivy-system');
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<'idle' | 'installing' | 'success' | 'error'>('idle');
  const [installError, setInstallError] = useState('');
  const [loading, setLoading] = useState(false);

  // Chart details
  const trivyChart = {
    name: 'trivy-operator',
    repository: {
      name: 'aqua',
      url: 'https://aquasecurity.github.io/helm-charts/'
    },
    version: '0.13.0',
    description: 'Kubernetes-native security toolkit'
  };

  // Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setReleaseName('trivy-operator');
      setNamespace(availableNamespaces.includes('trivy-system') ? 'trivy-system' : availableNamespaces[0] || 'default');
      setCreateNamespace(true);
      setCustomNamespace('trivy-system');
      setInstallStatus('idle');
      setInstallError('');
    }
  }, [isOpen, availableNamespaces]);

  // Manual status check function
  const handleCheckStatus = async () => {
    if (!releaseName || !currentContext) return;

    const targetNamespace = createNamespace ? customNamespace : namespace;

    try {
      setLoading(true);
      const status = await getHelmActionStatus(
        currentContext.name,
        releaseName,
        'install',
        targetNamespace
      );

      console.log('Installation status:', status);

      if (status.status === 'success') {
        setInstallStatus('success');
        setInstalling(false);
        onInstallSuccess();
      } else if (status.status === 'failed') {
        setInstallStatus('error');
        setInstallError(status.message || 'Installation failed');
        setInstalling(false);
      } else if (status.status === 'processing') {
        setInstallStatus('installing');
      }
    } catch (error) {
      console.error('Error checking install status:', error);
      setInstallError(`Failed to check status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    if (!currentContext || !releaseName) {
      setInstallError('Please fill in all required fields');
      return;
    }

    const targetNamespace = createNamespace ? customNamespace : namespace;
    if (!targetNamespace) {
      setInstallError('Please specify a namespace');
      return;
    }

    try {
      setInstalling(true);
      setInstallStatus('installing');
      setInstallError('');

      // Step 1: Add the repository first
      try {
        await addHelmRepository(
          currentContext.name,
          trivyChart.repository.name,
          trivyChart.repository.url
        );
        console.log(`Repository ${trivyChart.repository.name} added successfully`);
      } catch (repoError) {
        console.log(`Repository might already exist: ${repoError}`);
      }

      // Step 2: Install the release
      const installRequest = {
        name: releaseName,
        namespace: targetNamespace,
        description: `Install ${trivyChart.name} security scanner`,
        chart: `${trivyChart.repository.name}/${trivyChart.name}`,
        version: trivyChart.version,
        values: '', // Using default values
        createNamespace: createNamespace,
        dependencyUpdate: true
      };

      console.log('Installing Trivy with request:', installRequest);

      await installHelmRelease(currentContext.name, installRequest);

      console.log('Trivy installation request submitted successfully');
    } catch (error) {
      console.error('Error installing Trivy:', error);
      setInstallStatus('error');
      setInstallError(error instanceof Error ? error.message : 'Installation failed');
      setInstalling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl bg-gray-100 dark:bg-[#0B0D13]/50 border-gray-200 dark:border-gray-900/10 backdrop-blur-lg">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <SiTrivy className="w-8 h-8 text-blue-500" />
            <DialogTitle className="text-xl">Install Trivy Operator</DialogTitle>
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Kubernetes-native security toolkit for vulnerability scanning and compliance
          </p>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          <div className="bg-white dark:bg-transparent p-6 rounded-md space-y-4">
            <h3 className="text-lg font-medium">Installation Configuration</h3>

            {installStatus === 'installing' && (
              <Alert>
                <Loader2 className="flex items-center h-4 w-4 animate-spin dark:text-white" />
                <div className="flex items-center justify-between w-full">
                  <h1>
                    Installing {releaseName}... This may take a few minutes.
                  </h1>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckStatus}
                    disabled={loading}
                    className="ml-4"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check Status"}
                  </Button>
                </div>
              </Alert>
            )}

            {installStatus === 'success' && (
              <Alert className="flex items-center border-green-200 bg-green-50 dark:bg-green-900/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <h1 className="text-green-800 dark:text-green-300">
                  Successfully installed {releaseName} in namespace {createNamespace ? customNamespace : namespace}!
                </h1>
              </Alert>
            )}

            {installStatus === 'error' && (
              <Alert className="flex items-center border-red-200 bg-red-50 dark:bg-red-900/20">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <h1 className="text-red-800 dark:text-red-300">
                  Installation failed: {installError}
                </h1>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="release-name">Release Name *</Label>
                <Input
                  id="release-name"
                  value={releaseName}
                  onChange={(e) => setReleaseName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="trivy-operator"
                  disabled={installing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="namespace">Namespace *</Label>
                {createNamespace ? (
                  <Input
                    id="custom-namespace"
                    value={customNamespace}
                    onChange={(e) => setCustomNamespace(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="trivy-system"
                    disabled={installing}
                  />
                ) : (
                  <Select value={namespace} onValueChange={setNamespace} disabled={installing}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select namespace" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-100 dark:bg-[#0B0D13]/60 backdrop-blur-md dark:text-white">
                      {availableNamespaces.map((ns) => (
                        <SelectItem key={ns} value={ns}>
                          {ns}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="create-namespace"
                checked={createNamespace}
                onCheckedChange={(checked) => setCreateNamespace(checked as boolean)}
                disabled={installing}
              />
              <Label htmlFor="create-namespace" className="text-sm">
                Create namespace if it doesn't exist
              </Label>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-md">
              <h4 className="text-sm font-medium mb-2">Chart Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Chart:</span>
                  <span className="ml-2 font-medium">{trivyChart.name}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Version:</span>
                  <span className="ml-2 font-medium">{trivyChart.version}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500 dark:text-gray-400">Repository:</span>
                  <span className="ml-2 font-medium">{trivyChart.repository.url}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row mt-4">
          <Button
            onClick={handleInstall}
            disabled={installing || !releaseName || (!namespace && !createNamespace) || (createNamespace && !customNamespace) || !currentContext || installStatus === 'success'}
            className="flex items-center"
          >
            {installing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            {installStatus === 'success' ? 'Installed' : installing ? 'Installing...' : 'Install Trivy Operator'}
          </Button>

          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TrivyInstallDialog;