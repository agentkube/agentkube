import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, Download, Copy, Check, Package, Star, Clock, Shield, FileCode } from "lucide-react";
import Editor from '@monaco-editor/react';
import { getChartVersions, getChartDefaultValues } from '@/api/internal/helm';
import { openExternalUrl } from '@/api/external';

// Interface definitions for Artifact Hub API
interface ArtifactHubChart {
  package_id: string;
  name: string;
  normalized_name: string;
  display_name?: string;
  description: string;
  logo_image_id: string;
  repository: {
    repository_id: string;
    name: string;
    display_name: string;
    url: string;
    verified_publisher: boolean;
    organization_name: string;
  };
  version: string;
  app_version: string;
  stars: number;
  ts: number; // timestamp in seconds
  security_report_summary?: {
    low: number;
    high: number;
    medium: number;
    unknown: number;
    critical: number;
  };
  license?: string;
  production_organizations_count?: number;
}

interface ChartVersion {
  version: string;
  publishedAt: string;
}

interface HelmChartDialogProps {
  chart: ArtifactHubChart | null;
  isOpen: boolean;
  onClose: () => void;
}

const HelmChartDialog: React.FC<HelmChartDialogProps> = ({ chart, isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState("details");
  const [chartValues, setChartValues] = useState<string>('# Loading values...');
  const [loading, setLoading] = useState(false);
  const [versions, setVersions] = useState<ChartVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Fetch chart versions when chart changes
  useEffect(() => {
    if (chart && isOpen) {
      fetchChartVersions();
      setSelectedVersion(chart.version);
    }
  }, [chart, isOpen]);

  // Fetch values when version changes
  useEffect(() => {
    if (chart && selectedVersion) {
      fetchChartValues(chart.package_id, selectedVersion);
    }
  }, [selectedVersion, chart]);

  // Fetch chart versions
  const fetchChartVersions = async () => {
    if (!chart) return;
    
    try {
      setLoading(true);
      
      try {
        // Use our backend proxy endpoint
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
              extractedVersions.push({
                version,
                publishedAt: pubDate
              });
            }
          });
          
          if (extractedVersions.length > 0) {
            setVersions(extractedVersions);
            return;
          }
        }
      } catch (err) {
        console.warn('Error fetching chart versions from proxy:', err);
      }
      
      // If we reach here, we couldn't get versions, so use the current version
      setVersions([{
        version: chart.version,
        publishedAt: new Date().toISOString()
      }]);
      
    } catch (error) {
      console.error('Error fetching chart versions:', error);
      // Use the current chart version on error
      setVersions([{
        version: chart.version,
        publishedAt: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch chart values
  const fetchChartValues = async (packageId: string, version: string) => {
    try {
      setLoading(true);
      setChartValues('# Loading values...');
      
      try {
        // Use our backend proxy endpoint
        const values = await getChartDefaultValues(packageId, version);
        
        if (values && values.includes(':')) {
          setChartValues(values);
          return;
        }
      } catch (err) {
        console.error('Error fetching chart values from proxy:', err);
      }
      
      // If all attempts fail, provide a clear message
      setChartValues(`# Unable to fetch values for ${chart?.name} version ${version}\n# Please check the Artifact Hub website for values.yaml`);
      
    } catch (error) {
      console.error('Error in values fetch flow:', error);
      setChartValues(`# Error fetching values for ${chart?.name} version ${version}\n# Please check the Artifact Hub website for values.yaml`);
    } finally {
      setLoading(false);
    }
  };

  // Format relative time from timestamp
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

  // Handle copy values
  const handleCopyValues = () => {
    navigator.clipboard.writeText(chartValues);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Handle version change
  const handleVersionChange = (version: string) => {
    setSelectedVersion(version);
  };

  if (!chart) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl bg-gray-100 dark:bg-gray-900/20 backdrop-blur-sm">
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
          
          <Select value={selectedVersion} onValueChange={handleVersionChange}>
            <SelectTrigger className="w-36 bg-transparent dark:text-white dark:border-gray-800/50">
              <SelectValue placeholder="Version" />
            </SelectTrigger>
            <SelectContent className="bg-gray-100 dark:bg-gray-900 backdrop-blur-sm dark:text-white">
              {versions.map((v) => (
                <SelectItem key={v.version} value={v.version}>
                  {v.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="details">Chart Details</TabsTrigger>
            <TabsTrigger value="values">Default Values</TabsTrigger>
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
                      <div className="flex flex-col items-center">
                        <span className={`text-lg font-bold ${chart.security_report_summary.critical > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {chart.security_report_summary.critical}
                        </span>
                        <span className="text-xs text-gray-500">Critical</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className={`text-lg font-bold ${chart.security_report_summary.high > 0 ? 'text-orange-500' : 'text-gray-500'}`}>
                          {chart.security_report_summary.high}
                        </span>
                        <span className="text-xs text-gray-500">High</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className={`text-lg font-bold ${chart.security_report_summary.medium > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>
                          {chart.security_report_summary.medium}
                        </span>
                        <span className="text-xs text-gray-500">Medium</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className={`text-lg font-bold ${chart.security_report_summary.low > 0 ? 'text-blue-500' : 'text-gray-500'}`}>
                          {chart.security_report_summary.low}
                        </span>
                        <span className="text-xs text-gray-500">Low</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className={`text-lg font-bold ${chart.security_report_summary.unknown > 0 ? 'text-gray-500' : 'text-gray-500'}`}>
                          {chart.security_report_summary.unknown}
                        </span>
                        <span className="text-xs text-gray-500">Unknown</span>
                      </div>
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
                    <ul className="space-y-2 text-sm max-h-48 overflow-y-auto
                     scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
                    [&::-webkit-scrollbar]:w-1.5 
                    [&::-webkit-scrollbar-track]:bg-transparent 
                    [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                    [&::-webkit-scrollbar-thumb]:rounded-full
                    [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
                    ">
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
                      {versions.length === 0 ? " No version history available." : ""}
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
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
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
              <Button 
                variant="link" 
                size="sm" 
                className="ml-2 text-blue-500 hover:text-blue-700 p-0 h-auto"
                onClick={() => openExternalUrl(`https://artifacthub.io/packages/helm/${chart.repository.name}/${chart.name}/values`)} 
              >
                View on Artifact Hub <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="sm:order-1"
          >
            Close
          </Button>
          <Button 
            onClick={() => openExternalUrl(`https://artifacthub.io/packages/helm/${chart.repository.name}/${chart.name}`)}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
          >
            <ExternalLink className="h-4 w-4" />
            View on Artifact Hub
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HelmChartDialog;