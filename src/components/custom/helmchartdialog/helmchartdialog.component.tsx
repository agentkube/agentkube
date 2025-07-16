import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ExternalLink, Download, Copy, Check, Package, Star, Clock, Shield, FileCode, AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Editor from '@monaco-editor/react';
import { getChartVersions, getChartDefaultValues, installHelmRelease, getHelmActionStatus, encodeHelmValues } from '@/api/internal/helm';
import { openExternalUrl } from '@/api/external';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { ArtifactHubChart, ChartVersion } from '@/types/helm';

interface HelmChartDialogProps {
  chart: ArtifactHubChart | null;
  isOpen: boolean;
  onClose: () => void;
}

const HelmChartDialog: React.FC<HelmChartDialogProps> = ({ chart, isOpen, onClose }) => {
  const { currentContext } = useCluster();
  const { availableNamespaces } = useNamespace();
  
  const [activeTab, setActiveTab] = useState("details");
  const [chartValues, setChartValues] = useState<string>('# Loading values...');
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<ChartVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [copied, setCopied] = useState(false);
  
  // Installation form state
  const [releaseName, setReleaseName] = useState('');
  const [namespace, setNamespace] = useState('default');
  const [createNamespace, setCreateNamespace] = useState(false);
  const [customNamespace, setCustomNamespace] = useState('');
  const [customValues, setCustomValues] = useState('');
  const [useCustomValues, setUseCustomValues] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installStatus, setInstallStatus] = useState<'idle' | 'installing' | 'success' | 'error'>('idle');
  const [installError, setInstallError] = useState('');

  // Initialize when chart changes
  useEffect(() => {
    if (chart && isOpen) {
      fetchChartVersions();
      setSelectedVersion(chart.version);
      setReleaseName(chart.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
      setCustomValues('');
      setUseCustomValues(false);
      setCreateNamespace(false);
      setCustomNamespace('');
      setNamespace(availableNamespaces.includes('default') ? 'default' : availableNamespaces[0] || 'default');
      setInstallStatus('idle');
      setInstallError('');
    }
  }, [chart, isOpen, availableNamespaces]);

  // Fetch values when version changes
  useEffect(() => {
    if (chart && selectedVersion) {
      fetchChartValues(chart.package_id, selectedVersion);
    }
  }, [selectedVersion, chart]);

  // Poll installation status
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    
    if (installStatus === 'installing' && releaseName && currentContext) {
      const targetNamespace = createNamespace ? customNamespace : namespace;
      pollInterval = setInterval(async () => {
        try {
          const status = await getHelmActionStatus(
            currentContext.name,
            releaseName,
            'install',
            targetNamespace
          );

          
          if (status.status === 'success') {
            setInstallStatus('success');
            setInstalling(false);
          } else if (status.status === 'failed') {
            setInstallStatus('error');
            setInstallError(status.message || 'Installation failed');
            setInstalling(false);
          }
        } catch (error) {
          console.error('Error polling install status:', error);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [installStatus, releaseName, currentContext, namespace, createNamespace, customNamespace]);

  const fetchChartVersions = async () => {
    if (!chart) return;

    try {
      setLoading(true);
      const xmlText = await getChartVersions(chart.repository.name, chart.name);

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

      setVersions([{ version: chart.version, publishedAt: new Date().toISOString() }]);
    } catch (error) {
      console.error('Error fetching chart versions:', error);
      setVersions([{ version: chart.version, publishedAt: new Date().toISOString() }]);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartValues = async (packageId: string, version: string) => {
    try {
      setLoading(true);
      setChartValues('# Loading values...');

      const values = await getChartDefaultValues(packageId, version);
      if (values && values.includes(':')) {
        setChartValues(values);
      } else {
        setChartValues(`# Unable to fetch values for ${chart?.name} version ${version}\n# Please check the Artifact Hub website for values.yaml`);
      }
    } catch (error) {
      console.error('Error fetching chart values:', error);
      setChartValues(`# Error fetching values for ${chart?.name} version ${version}\n# Please check the Artifact Hub website for values.yaml`);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    if (!chart || !currentContext || !releaseName) {
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

      const valuesToUse = useCustomValues && customValues.trim() 
        ? encodeHelmValues(customValues) 
        : '';

      console.log({
        name: releaseName,
        namespace: targetNamespace,
        description: `Install ${chart.name} chart`,
        chart: `${chart.repository.name}/${chart.name}`,
        version: selectedVersion,
        values: valuesToUse,
        createNamespace: createNamespace,
        dependencyUpdate: true
      })

      await installHelmRelease(currentContext.name, {
        name: releaseName,
        namespace: targetNamespace,
        description: `Install ${chart.name} chart`,
        chart: `${chart.repository.name}/${chart.name}`,
        version: selectedVersion,
        values: valuesToUse,
        createNamespace: createNamespace,
        dependencyUpdate: true
      });
    } catch (error) {
      console.error('Error installing chart:', error);
      setInstallStatus('error');
      setInstallError(error instanceof Error ? error.message : 'Installation failed');
      setInstalling(false);
    }
  };

  const handleUseCustomValues = (checked: boolean) => {
    setUseCustomValues(checked);
    if (checked && !customValues.trim()) {
      setCustomValues(chartValues);
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    if (!timestamp) return 'Unknown';

    try {
      const now = Math.floor(Date.now() / 1000);
      const secondsAgo = now - timestamp;

      if (secondsAgo < 60) return 'just now';
      if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
      if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
      if (secondsAgo < 2592000) return `${Math.floor(secondsAgo / 86400)}d ago`;
      if (secondsAgo < 31536000) return `${Math.floor(secondsAgo / 2592000)}mo ago`;
      return `${Math.floor(secondsAgo / 31536000)}y ago`;
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Unknown';
    }
  };

  const handleCopyValues = () => {
    navigator.clipboard.writeText(useCustomValues ? customValues : chartValues);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!chart) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl bg-gray-100 dark:bg-[#0B0D13]/50 border-gray-200 dark:border-gray-900/10 backdrop-blur-lg">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            {chart.logo_image_id ? (
              <img
                src={`https://artifacthub.io/image/${chart.logo_image_id}`}
                alt={`${chart.name} logo`}
                className="w-10 h-10 rounded"
              />
            ) : (
              <Package className="w-8 h-8 text-gray-500 dark:text-gray-400" />
            )}
            <DialogTitle className="text-xl">{chart.display_name || chart.name}</DialogTitle>
          </div>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            {chart.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-between items-center mt-2">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400">
              <Star className="h-4 w-4" />
              <span className="text-sm">{chart.stars}</span>
            </div>
            {chart.repository.verified_publisher && (
              <span className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 text-xs px-2 py-1 rounded-full">
                Verified Publisher
              </span>
            )}
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {formatRelativeTime(chart.ts)}
            </span>
          </div>

          <Select value={selectedVersion} onValueChange={setSelectedVersion}>
            <SelectTrigger className="w-36 bg-transparent dark:text-white dark:border-gray-500/40">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent className="bg-gray-100 dark:bg-[#0B0D13]/60 backdrop-blur-md dark:text-white">
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
            <TabsTrigger value="details">Chart Details</TabsTrigger>
            <TabsTrigger value="values">Default Values</TabsTrigger>
            <TabsTrigger value="install">Install</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800/50 p-4 rounded-md">
                  <h3 className="text-sm font-medium mb-2">Chart Information</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Version:</span>
                      <span className="font-medium">{chart.version}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">App Version:</span>
                      <span className="font-medium">{chart.app_version}</span>
                    </li>
                    <li className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Repository:</span>
                      <span className="font-medium">{chart.repository.display_name || chart.repository.name}</span>
                    </li>
                    {chart.license && (
                      <li className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">License:</span>
                        <span className="font-medium">{chart.license}</span>
                      </li>
                    )}
                    {chart.production_organizations_count !== undefined && (
                      <li className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Production Use:</span>
                        <span className="font-medium">{chart.production_organizations_count} organizations</span>
                      </li>
                    )}
                  </ul>
                </div>

                {chart.security_report_summary && (
                  <div className="bg-white dark:bg-gray-800/50 p-4 rounded-md">
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-1">
                      <Shield className="h-4 w-4" />
                      Security Report
                    </h3>
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {['critical', 'high', 'medium', 'low', 'unknown'].map((level) => (
                        <div key={level} className="flex flex-col items-center">
                          <span className={`text-lg font-bold ${
                            level === 'critical' && chart.security_report_summary!.critical > 0 ? 'text-red-600' :
                            level === 'high' && chart.security_report_summary!.high > 0 ? 'text-orange-500' :
                            level === 'medium' && chart.security_report_summary!.medium > 0 ? 'text-yellow-600' :
                            level === 'low' && chart.security_report_summary!.low > 0 ? 'text-blue-500' :
                            'text-gray-500'
                          }`}>
                            {chart.security_report_summary![level as keyof typeof chart.security_report_summary]}
                          </span>
                          <span className="text-xs text-gray-500 capitalize">{level}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800/50 p-4 rounded-md">
                  <h3 className="text-sm font-medium mb-2">Installation</h3>
                  <div className="mt-3 bg-gray-50 dark:bg-gray-900/50 p-3 rounded border border-gray-200 dark:border-gray-700">
                    <code className="text-sm text-gray-700 dark:text-gray-300 block whitespace-pre overflow-x-auto">
                      helm repo add {chart.repository.name} {chart.repository.url}
                      <br />
                      helm install {chart.name} {chart.repository.name}/{chart.name} --version {selectedVersion}
                    </code>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800/50 p-4 rounded-md">
                  <h3 className="text-sm font-medium mb-2">Recent Versions</h3>
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
                      Currently showing version {chart.version}.
                    </div>
                  )}
                </div>
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
                    a.download = `${chart.name}-${selectedVersion}-values.yaml`;
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
              These are the default values for the {chart.name} chart (version {selectedVersion}).
            </div>
          </TabsContent>

          <TabsContent value="install" className="mt-4 space-y-6">
            <div className="bg-white dark:bg-transparent p-6 rounded-md space-y-4">
              <h3 className="text-lg font-medium">Installation Configuration</h3>
              
              {installStatus === 'installing' && (
                <Alert>
                  <Loader2 className="flex items-center h-4 w-4 animate-spin" />
                  <h1>
                    Installing {releaseName}... This may take a few minutes.
                  </h1>
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
                    placeholder="my-release"
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
                      placeholder="my-namespace"
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
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row mt-4">
          {activeTab === 'install' ? (
            <Button
              onClick={handleInstall}
              disabled={installing || !releaseName || (!namespace && !createNamespace) || (createNamespace && !customNamespace) || !currentContext || installStatus === 'success'}
              className=" flex items-center"
            >
              {installing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {installStatus === 'success' ? 'Installed' : installing ? 'Installing...' : 'Install Chart'}
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
          
          <Button
            onClick={() => openExternalUrl(`https://artifacthub.io/packages/helm/${chart.repository.name}/${chart.name}`)}
            className="flex items-center"
            variant="outline"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            View on Artifact Hub
          </Button>
          
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HelmChartDialog;