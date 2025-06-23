import React, { useEffect, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, ExternalLink, Settings, Download, Copy, Check } from "lucide-react";
import Editor from '@monaco-editor/react';
import { AWS_PROVIDER, GCP_PROVIDER, AZURE_PROVIDER } from '@/assets/providers';
import KUBERNETES from '@/assets/kubernetes.svg';
import ProxyConfigDialog from '../proxyconfigdialog/proxyconfigdialog.component';
import { openExternalUrl } from '@/api/external';
import { useCluster } from '@/contexts/clusterContext';


interface OpenCostInstallerProps {
  loading: boolean;
  onInstall: (cloudProvider: string) => void;
}

const OpenCostInstaller: React.FC<OpenCostInstallerProps> = ({ loading, onInstall }) => {
  const { currentContext } = useCluster();
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const [selectedCloudProvider, setSelectedCloudProvider] = useState("aws");
  const [activeTab, setActiveTab] = useState("options");
  const [copied, setCopied] = useState(false);
  const [yamlContent, setYamlContent] = useState('');
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [openCostConfig, setOpenCostConfig] = useState<{
    namespace: string;
    service: string;
  }>({
    namespace: 'opencost',
    service: 'opencost:9090'
  });

  const handleSaveConfig = (config: { namespace: string; service: string }) => {
    if (!currentContext) return;

    setOpenCostConfig(config);
    console.log('Saving OpenCost config:', config);
    localStorage.setItem(`${currentContext.name}.openCostConfig`, JSON.stringify({
      externalConfig: {
        opencost: config
      }
    }));
  };

  useEffect(() => {
    if (!currentContext) return;

    try {
      const savedConfig = localStorage.getItem(`${currentContext.name}.openCostConfig`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        if (parsedConfig.externalConfig?.opencost) {
          setOpenCostConfig(parsedConfig.externalConfig.opencost);
        }
      }
    } catch (err) {
      console.error('Error loading saved config:', err);
    }
  }, [currentContext]);

  const handleInstallClick = () => {
    setIsInstallDialogOpen(true);
    updateYamlContent();
  };

  const handleInstallConfirm = () => {
    onInstall(selectedCloudProvider);
    setIsInstallDialogOpen(false);
  };

  const handleCopyValuesYaml = () => {
    navigator.clipboard.writeText(yamlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Update the YAML content when cloud provider changes
  const updateYamlContent = () => {
    const valuesYaml = `# OpenCost Helm Values for ${selectedCloudProvider === "aws" ? "AWS" :
      selectedCloudProvider === "gcp" ? "Google Cloud" :
        selectedCloudProvider === "azure" ? "Azure" : "Custom"
      }
opencost:
  exporter:
    cloudProviderApiKey: "${selectedCloudProvider === "aws" ? "AWS_ACCESS_KEY" :
        selectedCloudProvider === "gcp" ? "GOOGLE_APPLICATION_CREDENTIALS" :
          selectedCloudProvider === "azure" ? "AZURE_SERVICE_KEY" : "YOUR_API_KEY"}"
  prometheus:
    server: http://prometheus-server.monitoring.svc.cluster.local:9090

productAnalytics:
  enabled: false

service:
  type: ClusterIP
  port: 9003

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi
${selectedCloudProvider === "aws" ? `
# AWS specific settings
cloudProvider: aws
aws:
  servicePricing:
    enabled: true
    region: us-east-1
` : selectedCloudProvider === "gcp" ? `
# GCP specific settings
cloudProvider: gcp
gcp:
  projectID: your-gcp-project-id
` : selectedCloudProvider === "azure" ? `
# Azure specific settings
cloudProvider: azure
azure:
  subscriptionId: your-subscription-id
  tenantId: your-tenant-id
` : `
# Custom provider settings
cloudProvider: custom
customPricing:
  enabled: true
  configPath: /models/pricing/custom.json
`}`;

    setYamlContent(valuesYaml);
  };

  // Update YAML when cloud provider changes
  React.useEffect(() => {
    updateYamlContent();
  }, [selectedCloudProvider]);

  // Determine if we're in dark mode
  const isDarkMode = document.documentElement.classList.contains('dark');

  return (
    <>
      <div className="p-6 mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Cost Overview</h1>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsConfigDialogOpen(true)}
            className="flex items-center gap-1"
          >
            <Settings className="h-4 w-4" />
          </Button>
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

        <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
          <CardContent className="p-8">
            <div className="text-center py-12">
              <DollarSign className="h-16 w-16 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
              <h3 className="text-2xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                OpenCost Not Detected
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-lg mx-auto">
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

      {/* Installation Dialog */}
      <Dialog open={isInstallDialogOpen} onOpenChange={setIsInstallDialogOpen}>
        <DialogContent className="sm:max-w-3xl bg-gray-100 dark:bg-gray-900/20 backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="text-xl">Install OpenCost</DialogTitle>
            <DialogDescription>
              Configure OpenCost installation for your Kubernetes cluster
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="options">Installation Options</TabsTrigger>
              <TabsTrigger value="values">Helm Values</TabsTrigger>
            </TabsList>

            <TabsContent value="options" className="mt-4 space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3">Select Cloud Provider</h3>
                <Select value={selectedCloudProvider} onValueChange={setSelectedCloudProvider}>
                  <SelectTrigger className="w-full bg-transparent backdrop-blur-sm dark:text-white dark:border-gray-800/50">
                    <SelectValue placeholder="Select cloud provider" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-100 dark:bg-gray-900 backdrop-blur-sm dark:text-white">
                    <SelectItem value="aws">
                      <div className="flex items-center">
                        <img src={AWS_PROVIDER} alt="AWS" className="mr-2 h-5 w-5" />
                        AWS
                      </div>
                    </SelectItem>
                    <SelectItem value="gcp">
                      <div className="flex items-center">
                        <img src={GCP_PROVIDER} alt="GCP" className="mr-2 h-5 w-5" />
                        Google Cloud
                      </div>
                    </SelectItem>
                    <SelectItem value="azure">
                      <div className="flex items-center">
                        <img src={AZURE_PROVIDER} alt="Azure" className="mr-2 h-5 w-5" />
                        Azure
                      </div>
                    </SelectItem>
                    <SelectItem value="other">
                      <div className="flex items-center">
                        <img src={KUBERNETES} alt="Other" className="mr-2 h-5 w-5" />
                        Custom: On-Premises
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-md">
                <h3 className="text-sm font-medium mb-2">Requirements</h3>
                <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                  <li>• Kubernetes cluster with Helm installed</li>
                  <li>• Prometheus deployed in your cluster</li>
                  <li>• Cloud provider credentials with billing access</li>
                </ul>
              </div>
            </TabsContent>

            <TabsContent value="values" className="mt-4">
              <div className="relative">
                <div className="absolute right-2 top-2 z-10 flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={handleCopyValuesYaml}
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
                      const blob = new Blob([yamlContent], { type: 'text/yaml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'opencost-values.yaml';
                      a.click();
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>

                <div className="h-96 mt-2 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700">
                  <Editor
                    height="100%"
                    width="100%"
                    defaultLanguage="yaml"
                    value={yamlContent}
                    onChange={(value) => setYamlContent(value || '')}
                    theme={'vs-dark'}
                    options={{
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      fontSize: 14,
                      lineNumbers: 'on',
                      roundedSelection: false,
                      tabSize: 2,
                      automaticLayout: true,
                      readOnly: false
                    }}
                  />
                </div>
              </div>

              <div className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                This configuration can be used with the Helm chart to install OpenCost.
                <br />
                Command: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs">helm install opencost opencost/opencost -f values.yaml -n opencost</code>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsInstallDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInstallConfirm}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? 'Installing...' : 'Install OpenCost'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default OpenCostInstaller;