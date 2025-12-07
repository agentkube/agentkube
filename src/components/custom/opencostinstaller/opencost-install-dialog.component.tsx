import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Download, DollarSign, AlertCircle, CheckCircle, Copy, Check, FileCode } from 'lucide-react';
import { Alert } from "@/components/ui/alert";
import Editor from '@monaco-editor/react';
import { addHelmRepository, installHelmRelease, getHelmActionStatus, getChartVersions, getChartDefaultValues, encodeHelmValues } from '@/api/internal/helm';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { AWS_PROVIDER, GCP_PROVIDER, AZURE_PROVIDER } from '@/assets/providers';
import { ChartVersion } from '@/types/helm';

interface OpenCostInstallDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInstallSuccess: () => void;
}

const OpenCostInstallDialog: React.FC<OpenCostInstallDialogProps> = ({ isOpen, onClose, onInstallSuccess }) => {
  const { currentContext } = useCluster();
  const { availableNamespaces } = useNamespace();

  // Installation form state
  const [releaseName, setReleaseName] = useState('opencost');
  const [namespace, setNamespace] = useState('opencost');
  const [createNamespace, setCreateNamespace] = useState(true);
  const [customNamespace, setCustomNamespace] = useState('opencost');
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<'idle' | 'installing' | 'success' | 'error'>('idle');
  const [installError, setInstallError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedCloudProvider, setSelectedCloudProvider] = useState('aws');
  const [activeTab, setActiveTab] = useState('details');
  const [chartValues, setChartValues] = useState<string>('# Loading values...');
  const [versions, setVersions] = useState<ChartVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [customValues, setCustomValues] = useState('');
  const [useCustomValues, setUseCustomValues] = useState(false);
  const [copied, setCopied] = useState(false);

  // Chart details - using the correct Artifact Hub package ID
  const openCostChart = {
    name: 'opencost',
    repository: {
      name: 'opencost',
      url: 'https://opencost.github.io/opencost-helm-chart'
    },
    version: '2.3.1',
    description: 'OpenCost and OpenCost UI',
    package_id: 'a7cfe5e7-b5c5-4ef5-86f6-8d35d2bf6e1f' // Correct Artifact Hub package ID for OpenCost
  };

  // Initialize when dialog opens
  useEffect(() => {
    if (isOpen) {
      setReleaseName('opencost');
      setNamespace(availableNamespaces.includes('opencost') ? 'opencost' : availableNamespaces[0] || 'default');
      setCreateNamespace(true);
      setCustomNamespace('opencost');
      setInstallStatus('idle');
      setInstallError('');
      setSelectedCloudProvider('aws');
      setSelectedVersion(openCostChart.version);
      setCustomValues('');
      setUseCustomValues(false);
      setActiveTab('details');
      fetchChartVersions();
      fetchChartValues(openCostChart.package_id, openCostChart.version);
    }
  }, [isOpen, availableNamespaces]);

  // Fetch values when version changes
  useEffect(() => {
    if (selectedVersion && isOpen) {
      fetchChartValues(openCostChart.package_id, selectedVersion);
    }
  }, [selectedVersion, isOpen]);

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

  // Fetch chart versions
  const fetchChartVersions = async () => {
    try {
      setLoading(true);
      const xmlText = await getChartVersions(openCostChart.repository.name, openCostChart.name);

      if (xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const versionItems = xmlDoc.querySelectorAll('item');
        const extractedVersions: ChartVersion[] = [];

        versionItems.forEach((item) => {
          const version = item.querySelector('title')?.textContent || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';

          if (version && pubDate) {
            extractedVersions.push({ version, publishedAt: pubDate });
          }
        });

        if (extractedVersions.length > 0) {
          setVersions(extractedVersions);
          return;
        }
      }

      setVersions([{ version: openCostChart.version, publishedAt: new Date().toISOString() }]);
    } catch (error) {
      console.error('Error fetching chart versions:', error);
      setVersions([{ version: openCostChart.version, publishedAt: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch chart values
  const fetchChartValues = async (packageId: string, version: string) => {
    try {
      setLoading(true);
      setChartValues('# Loading values...');

      const values = await getChartDefaultValues(packageId, version);
      if (values && values.includes(':')) {
        setChartValues(values);
      } else {
        setChartValues(`# Unable to fetch values for ${openCostChart.name} version ${version}\n# Please check the Artifact Hub website for values.yaml`);
      }
    } catch (error) {
      console.error('Error fetching chart values:', error);
      setChartValues(`# Error fetching values for ${openCostChart.name} version ${version}\n# Please check the Artifact Hub website for values.yaml`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyValues = () => {
    navigator.clipboard.writeText(useCustomValues ? customValues : chartValues);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUseCustomValues = (checked: boolean) => {
    setUseCustomValues(checked);
    if (checked && !customValues.trim()) {
      setCustomValues(chartValues);
    }
  };

  const generateHelmValues = () => {
    const baseValues: any = {
      opencost: {
        exporter: {
          cloudProviderApiKey: selectedCloudProvider === 'aws' ? 'AWS_ACCESS_KEY' :
            selectedCloudProvider === 'gcp' ? 'GOOGLE_APPLICATION_CREDENTIALS' :
              'AZURE_SERVICE_KEY'
        },
        prometheus: {
          internal: {
            enabled: false
          },
          external: {
            url: 'http://prometheus-server.monitoring.svc.cluster.local:80'
          }
        }
      },
      productAnalytics: {
        enabled: false
      },
      service: {
        type: 'ClusterIP',
        port: 9003
      },
      resources: {
        requests: {
          cpu: '100m',
          memory: '128Mi'
        },
        limits: {
          cpu: '500m',
          memory: '256Mi'
        }
      }
    };

    // Add cloud provider specific settings
    if (selectedCloudProvider === 'aws') {
      baseValues.opencost.exporter = {
        ...baseValues.opencost.exporter,
        aws: {
          region: 'us-east-1'
        }
      };
    } else if (selectedCloudProvider === 'gcp') {
      baseValues.opencost.exporter = {
        ...baseValues.opencost.exporter,
        gcp: {
          projectID: 'your-gcp-project-id'
        }
      };
    } else if (selectedCloudProvider === 'azure') {
      baseValues.opencost.exporter = {
        ...baseValues.opencost.exporter,
        azure: {
          subscriptionId: 'your-subscription-id',
          tenantId: 'your-tenant-id'
        }
      };
    }

    return JSON.stringify(baseValues, null, 2);
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
          openCostChart.repository.name,
          openCostChart.repository.url
        );
        console.log(`Repository ${openCostChart.repository.name} added successfully`);
      } catch (repoError) {
        console.log(`Repository might already exist: ${repoError}`);
      }

      // Step 2: Prepare values
      const valuesToUse = useCustomValues && customValues.trim()
        ? encodeHelmValues(customValues)
        : generateHelmValues();

      // Step 3: Install the release with values
      const installRequest = {
        name: releaseName,
        namespace: targetNamespace,
        description: `Install ${openCostChart.name} cost monitoring`,
        chart: `${openCostChart.repository.name}/${openCostChart.name}`,
        version: selectedVersion,
        values: valuesToUse,
        createNamespace: createNamespace,
        dependencyUpdate: true
      };

      console.log('Installing OpenCost with request:', installRequest);

      await installHelmRelease(currentContext.name, installRequest);

      console.log('OpenCost installation request submitted successfully');
    } catch (error) {
      console.error('Error installing OpenCost:', error);
      setInstallStatus('error');
      setInstallError(error instanceof Error ? error.message : 'Installation failed');
      setInstalling(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl bg-card border-border backdrop-blur-lg">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-500" />
            <DialogTitle className="text-xl">Install OpenCost</DialogTitle>
          </div>
          <p className="text-muted-foreground">
            Open source cost monitoring for Kubernetes workloads
          </p>
        </DialogHeader>

        <div className="flex justify-between items-center mt-2">
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Version:</span>
          </div>
          <Select value={selectedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger className="w-36 bg-transparent text-foreground border-border">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent className="bg-card backdrop-blur-md text-foreground">
              {versions.map((v) => (
                <SelectItem key={v.version} value={v.version}>
                  {v.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="details">Configuration</TabsTrigger>
            <TabsTrigger value="values">Default Values</TabsTrigger>
            <TabsTrigger value="install">Install</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            <div className="bg-card p-6 rounded-md space-y-4">
              <h3 className="text-lg font-medium">Chart Information</h3>

              <div className="bg-secondary p-4 rounded-md">
                <h4 className="text-sm font-medium mb-2">Chart Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Chart:</span>
                    <span className="ml-2 font-medium">{openCostChart.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Version:</span>
                    <span className="ml-2 font-medium">{selectedVersion}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Repository:</span>
                    <span className="ml-2 font-medium">{openCostChart.repository.url}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Description:</span>
                    <span className="ml-2 font-medium">{openCostChart.description}</span>
                  </div>
                </div>
              </div>

              <div className="bg-secondary p-4 rounded-md">
                <h4 className="text-sm font-medium mb-2">Recent Versions</h4>
                {versions.length > 1 ? (
                  <ul className="space-y-2 text-sm max-h-48 overflow-y-auto scrollbar-thin">
                    {versions.slice(0, 10).map((v) => (
                      <li key={v.version} className={`flex justify-between ${v.version === selectedVersion ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}`}>
                        <span>{v.version}</span>
                        <span className="text-gray-500 dark:text-gray-400 text-xs">
                          {new Date(v.publishedAt).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-500 dark:text-gray-400 p-2">
                    Currently showing version {selectedVersion}.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="values" className="mt-4">
            <div className="relative">
              <div className="absolute right-2 top-2 z-10 flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={handleCopyValues}
                  disabled={loading}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => {
                    const blob = new Blob([chartValues], { type: 'text/yaml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${openCostChart.name}-${selectedVersion}-values.yaml`;
                    a.click();
                  }}
                  disabled={loading}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>

              <div className="h-96 mt-2 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                {loading ? (
                  <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900/50">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    width="100%"
                    defaultLanguage="yaml"
                    value={chartValues}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 14,
                      lineNumbers: 'on',
                      roundedSelection: false,
                      tabSize: 2,
                      automaticLayout: true,
                      readOnly: true
                    }}
                  />
                )}
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-500 dark:text-gray-400 flex items-center">
              <FileCode className="h-4 w-4 mr-1" />
              These are the default values for the {openCostChart.name} chart (version {selectedVersion}).
            </div>
          </TabsContent>

          <TabsContent value="install" className="mt-4 space-y-6">
            <div className="bg-white dark:bg-transparent p-6 rounded-md space-y-4">
              <h3 className="text-lg font-medium">Installation Configuration</h3>

              {installStatus === 'installing' && (
                <Alert>
                  <Loader2 className="flex items-center h-4 w-4 animate-spin" />
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
                    placeholder="opencost"
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
                      placeholder="opencost"
                      disabled={installing}
                    />
                  ) : (
                    <Select value={namespace} onValueChange={setNamespace} disabled={installing}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select namespace" />
                      </SelectTrigger>
                      <SelectContent className="bg-card backdrop-blur-md text-foreground">
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

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="use-custom-values"
                    checked={useCustomValues}
                    onCheckedChange={handleUseCustomValues}
                    disabled={installing}
                  />
                  <Label htmlFor="use-custom-values" className="text-sm">
                    Use custom values (pre-populated with defaults)
                  </Label>
                </div>

                {useCustomValues && (
                  <div className="space-y-2">
                    <Label htmlFor="custom-values">Custom Values (YAML)</Label>
                    <div className="h-64 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                      <Editor
                        height="100%"
                        width="100%"
                        defaultLanguage="yaml"
                        value={customValues}
                        onChange={(value) => setCustomValues(value || '')}
                        theme="vs-dark"
                        options={{
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          fontSize: 14,
                          lineNumbers: 'on',
                          roundedSelection: false,
                          tabSize: 2,
                          automaticLayout: true,
                          readOnly: installing
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Label htmlFor="cloud-provider">Cloud Provider *</Label>
                </div>
                <Select value={selectedCloudProvider} onValueChange={setSelectedCloudProvider} disabled={installing}>
                  <SelectTrigger className="bg-transparent backdrop-blur-sm dark:text-white dark:border-gray-500/40">
                    <SelectValue placeholder="Select cloud provider" />
                  </SelectTrigger>
                  <SelectContent className="bg-card backdrop-blur-md text-foreground">
                    <SelectItem value="aws">
                      <div className="flex items-center gap-2">
                        <img src={AWS_PROVIDER} alt="AWS" className="h-5 w-5" />
                        AWS
                      </div>
                    </SelectItem>
                    <SelectItem value="gcp">
                      <div className="flex items-center gap-2">
                        <img src={GCP_PROVIDER} alt="GCP" className="h-5 w-5" />
                        Google Cloud
                      </div>
                    </SelectItem>
                    <SelectItem value="azure">
                      <div className="flex items-center gap-2">
                        <img src={AZURE_PROVIDER} alt="Azure" className="h-5 w-5" />
                        Azure
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row mt-4">
          {activeTab === 'install' ? (
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
              {installStatus === 'success' ? 'Installed' : installing ? 'Installing...' : 'Install OpenCost'}
            </Button>
          ) : (
            <Button
              onClick={() => setActiveTab('install')}
              className="flex items-center"
              variant="outline"
            >
              <Download className="h-4 w-4 mr-2" />
              Install
            </Button>
          )}

          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OpenCostInstallDialog;