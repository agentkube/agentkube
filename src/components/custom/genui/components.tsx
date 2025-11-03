import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUpRight } from 'lucide-react';

// Sample ResourceList component - renders a colorful card for list_resources
interface ResourceListProps {
  command?: string;
  output?: string;
}

const ResourceListComponent: React.FC<ResourceListProps> = ({ command, output }) => {
  return (
    <div className="my-4 p-4 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
      <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-300 mb-2">
        🎨 Custom GenUI Component - Resource List
      </h3>
      <div className="space-y-2">
        {command && (
          <div className="text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Command:</span>
            <code className="ml-2 bg-gray-800 text-green-400 px-2 py-1 rounded text-xs">
              {command}
            </code>
          </div>
        )}
        {output && (
          <div className="text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Output:</span>
            <pre className="mt-1 bg-gray-800 text-gray-200 p-2 rounded text-xs overflow-auto max-h-48">
              {output}
            </pre>
          </div>
        )}
        <div className="mt-3 text-xs text-purple-600 dark:text-purple-400 italic">
          ✨ This is a custom GenUI component rendered for list_resources tool
        </div>
      </div>
    </div>
  );
};

// Image Vulnerability Summary component
interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown?: number;
  total: number;
}

interface ScanResult {
  image: string;
  summary: VulnerabilitySummary;
  scanTime: string;
  status: string;
}

interface ImageVulnerabilitySummaryProps {
  results?: ScanResult[];
  success?: boolean;
  message?: string;
}

const ImageVulnerabilitySummaryComponent = (
  props: ImageVulnerabilitySummaryProps
): JSX.Element => {
  const { results, success, message } = props;

  if (!success || !results || results.length === 0) {
    return <></>;
  }

  const scanResult = results[0]; // Show first result

  const handleOpenDrawer = () => {
    // TODO: Implement drawer opening logic
    console.log('Open vulnerability drawer for:', scanResult.image);
  };

  return (
    <div className="my-4 p-4 rounded-lg bg-transparent dark:bg-transparent border border-gray-300 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs uppercase font-medium text-gray-900 dark:text-gray-400">
            Image Vulnerability  Results
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-200 mt-1">
            {scanResult.image}
          </p>
        </div>
        {/* <button
          onClick={handleOpenDrawer}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
        >
          View Details
          <ArrowUpRight className="w-4 h-4" />
        </button> */}
      </div>

      {/* Severity Cards */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Critical', count: scanResult.summary.critical, severity: 'critical' },
          { label: 'High', count: scanResult.summary.high, severity: 'high' },
          { label: 'Medium', count: scanResult.summary.medium, severity: 'medium' },
          { label: 'Low', count: scanResult.summary.low, severity: 'low' }
        ].map(({ label, count, severity }) => (
          <Card key={label} className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
            <CardContent className="py-2 px-2 flex flex-col h-full">
              <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">{label}</h2>
              <div className="mt-auto">
                <p className={`text-5xl font-light mb-1 ${
                  severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                  severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                  severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-blue-600 dark:text-blue-400'
                }`}>
                  {count}
                </p>
                <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                  <div className={`h-1 rounded-[0.3rem] ${
                    severity === 'critical' ? 'bg-red-500 dark:bg-red-400' :
                    severity === 'high' ? 'bg-orange-500 dark:bg-orange-400' :
                    severity === 'medium' ? 'bg-yellow-500 dark:bg-yellow-400' :
                    'bg-blue-500 dark:bg-blue-400'
                  }`} style={{ width: '100%' }}></div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-800">
        <span>Status: <span className="font-medium text-green-600 dark:text-green-400">{scanResult.status}</span></span>
        <span>Scanned: {new Date(scanResult.scanTime).toLocaleString()}</span>
        <span>Total: <span className="font-medium">{scanResult.summary.total} vulnerabilities</span></span>
      </div>
    </div>
  );
};

// Component map - maps tool names to React components
export const ComponentMap = {
  sample_resource_name: ResourceListComponent,
  image_vulnerability_summary: ImageVulnerabilitySummaryComponent,
  // Add more component mappings here as needed
  // example: kubectl_get: KubectlGetComponent,
};

export type ComponentMapType = typeof ComponentMap;
