import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ExternalLink, Copy, Check, Star, Download, PackageOpen, Info, FileText, Link as LinkIcon, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Define types for chart data from Artifact Hub API
interface ContainerImage {
  name: string;
  image: string;
  whitelisted: boolean;
}

interface SecurityReportSummary {
  low: number;
  high: number;
  medium: number;
  unknown: number;
  critical: number;
}

interface Link {
  url: string;
  name: string;
}

interface Maintainer {
  name: string;
  email?: string;
}

interface Repository {
  repository_id: string;
  name: string;
  display_name?: string;
  url: string;
  verified_publisher: boolean;
  official: boolean;
  organization_name?: string;
}

interface HelmChart {
  package_id: string;
  name: string;
  display_name?: string;
  description: string;
  logo_image_id?: string;
  version: string;
  app_version?: string;
  license?: string;
  readme?: string;
  repository: Repository;
  stars?: number;
  security_report_summary?: SecurityReportSummary;
  containers_images?: ContainerImage[];
  signed?: boolean;
  links?: Link[];
  maintainers?: Maintainer[];
}

// Fix: Make RouteParams a Record type with string indices
interface RouteParams extends Record<string, string | undefined> {
  repo?: string;
  name?: string;
}

const ChartsView: React.FC = () => {
  const { repo, name } = useParams<RouteParams>();
  const [chart, setChart] = useState<HelmChart | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("readme");
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const fetchChartDetails = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://artifacthub.io/api/v1/packages/helm/${repo}/${name}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch chart details: ${response.status}`);
        }
        
        const data = await response.json();
        setChart(data);
        setError(null);
      } catch (err: unknown) {
        console.error('Error fetching chart details:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch chart details'
        );
      } finally {
        setLoading(false);
      }
    };

    if (repo && name) {
      fetchChartDetails();
    }
  }, [repo, name]);

  const handleCopyInstallCommand = () => {
    if (!chart) return;
    
    const command = `helm repo add ${chart.repository.name} ${chart.repository.url}\nhelm install ${chart.name} ${chart.repository.name}/${chart.name}`;
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="m-6">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!chart) {
    return (
      <Alert className="m-6">
        <AlertDescription>Chart not found.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
        scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      
      {/* Chart Header Section */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Chart Logo */}
        <div className="w-20 h-20 flex-shrink-0 bg-gray-200 dark:bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
          {chart.logo_image_id ? (
            <img 
              src={`https://artifacthub.io/image/${chart.logo_image_id}`} 
              alt={`${chart.name} logo`} 
              className="w-full h-full object-contain"
            />
          ) : (
            <PackageOpen className="w-10 h-10 text-gray-500" />
          )}
        </div>

        {/* Chart Info */}
        <div className="flex-grow">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{chart.name}</h1>
            {chart.repository.verified_publisher && (
              <Badge className="bg-green-500 text-white">Verified</Badge>
            )}
            {chart.repository.official && (
              <Badge className="bg-blue-500 text-white">Official</Badge>
            )}
          </div>
          
          <div className="mt-1 flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <span>Repository: {chart.repository.display_name || chart.repository.name}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Star className="h-4 w-4 text-amber-500" />
              {chart.stars || 0}
            </span>
          </div>
          
          <p className="mt-3 text-gray-700 dark:text-gray-300">{chart.description}</p>
          
          {/* Installation Commands */}
          <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">Installation</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyInstallCommand}
                className="h-7 px-2"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <div className="font-mono text-sm">
              <div>$ helm repo add {chart.repository.name} {chart.repository.url}</div>
              <div>$ helm install {chart.name} {chart.repository.name}/{chart.name}</div>
            </div>
          </div>
        </div>

        {/* Chart Metadata */}
        <div className="md:w-1/4 flex-shrink-0">
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-md space-y-4">
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Version</div>
              <div className="font-medium">{chart.version}</div>
            </div>
            
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">App Version</div>
              <div className="font-medium">{chart.app_version || "N/A"}</div>
            </div>
            
            <div>
              <div className="text-sm text-gray-500 dark:text-gray-400">License</div>
              <div className="font-medium">{chart.license || "N/A"}</div>
            </div>
            
            {chart.containers_images && chart.containers_images.length > 0 && (
              <div>
                <div className="text-sm text-gray-500 dark:text-gray-400">Images</div>
                <div className="font-medium">{chart.containers_images.length}</div>
              </div>
            )}
            
            <div>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center"
                onClick={() => window.open(`https://artifacthub.io/packages/helm/${chart.repository.name}/${chart.name}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View on Artifact Hub
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Chart Details Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-gray-100 dark:bg-gray-800">
          <TabsTrigger value="readme">
            <FileText className="h-4 w-4 mr-2" />
            README
          </TabsTrigger>
          <TabsTrigger value="installation">
            <Download className="h-4 w-4 mr-2" />
            Installation
          </TabsTrigger>
          <TabsTrigger value="security">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
          <TabsTrigger value="links">
            <LinkIcon className="h-4 w-4 mr-2" />
            Links
          </TabsTrigger>
        </TabsList>

        <TabsContent value="readme" className="mt-4">
          <Card className="p-6 bg-white dark:bg-gray-800/20 border-gray-200 dark:border-gray-700/30">
            <div className="prose dark:prose-invert max-w-none">
              {chart.readme ? (
                <div dangerouslySetInnerHTML={{ __html: chart.readme }} />
              ) : (
                <div className="text-gray-500 dark:text-gray-400 italic">
                  No README information available for this chart.
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="installation" className="mt-4">
          <Card className="p-6 bg-white dark:bg-gray-800/20 border-gray-200 dark:border-gray-700/30">
            <h3 className="text-xl font-semibold mb-4">Installation Instructions</h3>
            
            <div className="mb-6">
              <h4 className="font-medium mb-2">1. Add Helm Repository</h4>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm">
                helm repo add {chart.repository.name} {chart.repository.url}
              </div>
            </div>
            
            <div className="mb-6">
              <h4 className="font-medium mb-2">2. Update Helm Repositories</h4>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm">
                helm repo update
              </div>
            </div>
            
            <div className="mb-6">
              <h4 className="font-medium mb-2">3. Install Chart</h4>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm">
                helm install {chart.name} {chart.repository.name}/{chart.name}
              </div>
            </div>
            
            <div className="mb-6">
              <h4 className="font-medium mb-2">4. Install with Custom Values (Optional)</h4>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md font-mono text-sm">
                helm install {chart.name} {chart.repository.name}/{chart.name} --values custom-values.yaml
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card className="p-6 bg-white dark:bg-gray-800/20 border-gray-200 dark:border-gray-700/30">
            <h3 className="text-xl font-semibold mb-4">Security Information</h3>
            
            {chart.security_report_summary ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Critical</div>
                    <div className={`text-2xl font-bold ${chart.security_report_summary.critical > 0 ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {chart.security_report_summary.critical}
                    </div>
                  </div>
                  
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">High</div>
                    <div className={`text-2xl font-bold ${chart.security_report_summary.high > 0 ? 'text-orange-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {chart.security_report_summary.high}
                    </div>
                  </div>
                  
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Medium</div>
                    <div className={`text-2xl font-bold ${chart.security_report_summary.medium > 0 ? 'text-yellow-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {chart.security_report_summary.medium}
                    </div>
                  </div>
                  
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Low</div>
                    <div className={`text-2xl font-bold ${chart.security_report_summary.low > 0 ? 'text-blue-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {chart.security_report_summary.low}
                    </div>
                  </div>
                  
                  <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Unknown</div>
                    <div className={`text-2xl font-bold ${chart.security_report_summary.unknown > 0 ? 'text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>
                      {chart.security_report_summary.unknown}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Images</h4>
                  {chart.containers_images && chart.containers_images.length > 0 ? (
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                      <ul className="space-y-2">
                        {chart.containers_images.map((image, index) => (
                          <li key={index} className="text-sm font-mono">
                            {image.image}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="text-gray-500 dark:text-gray-400 italic">
                      No container images information available.
                    </div>
                  )}
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Signed Chart</h4>
                  <div className="flex items-center">
                    {chart.signed ? (
                      <div className="flex items-center text-green-500">
                        <Check className="h-5 w-5 mr-1" />
                        Chart is signed
                      </div>
                    ) : (
                      <div className="text-gray-500 dark:text-gray-400">
                        Chart is not signed
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-500 dark:text-gray-400 italic">
                No security information available for this chart.
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="links" className="mt-4">
          <Card className="p-6 bg-white dark:bg-gray-800/20 border-gray-200 dark:border-gray-700/30">
            <h3 className="text-xl font-semibold mb-4">Related Links</h3>
            
            {chart.links && chart.links.length > 0 ? (
              <ul className="space-y-3">
                {chart.links.map((link, index) => (
                  <li key={index} className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                    <a 
                      href={link.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="flex items-center text-blue-500 hover:text-blue-600"
                    >
                      <LinkIcon className="h-4 w-4 mr-2" />
                      {link.name}
                      <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500 dark:text-gray-400 italic">
                No links available for this chart.
              </div>
            )}
            
            <div className="mt-6">
              <h4 className="font-medium mb-2">Repository</h4>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                <a 
                  href={chart.repository.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex items-center text-blue-500 hover:text-blue-600"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  {chart.repository.url}
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </div>
            </div>
            
            {chart.maintainers && chart.maintainers.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium mb-2">Maintainers</h4>
                <ul className="space-y-2">
                  {chart.maintainers.map((maintainer, index) => (
                    <li key={index} className="bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                      <div className="flex items-center">
                        <Info className="h-4 w-4 mr-2 text-gray-500" />
                        <span className="font-medium">{maintainer.name}</span>
                        {maintainer.email && (
                          <a 
                            href={`mailto:${maintainer.email}`} 
                            className="ml-2 text-blue-500 hover:text-blue-600"
                          >
                            {maintainer.email}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChartsView;