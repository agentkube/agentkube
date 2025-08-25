import React, { useState } from 'react';
import { SiNodedotjs, SiKubernetes, SiGooglecloud } from '@icons-pack/react-simple-icons';
import { ArrowUpRight, CheckCheck, CopyIcon, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Tracing from './tracing.component';
import Metrics from './metrics.component';

interface TelemetryProps {
  resourceName: string;
  namespace: string;
  kind: string;
  onClose: () => void;
}

const MOCK_SERVICE_DATA = {
  serviceName: 'adservice',
  namespace: 'opentelemetry-demo',
  requestTotal: 85,
  requestPercentage: 59.59,
  errorPercentage: 27.06,
  durationAverage: 9.15,
  durationUnit: 'ms',
  summary: {
    service: 'opentelemetry-demo.adservice',
    runtime: 'Node.JS v10.4.16 LTS',
    platform: 'gcp-opentelemetry-demo-adservice',
    cloud: 'gcp-west-1a / 04637668789'
  },
  operations: [
    { type: 'RPC', name: 'oteldemo.AdService GetAds', requests: '85.1M', errorRate: 27.36, duration: 9.13 },
  ],
  resources: [
    { type: 'Infra', name: 'opentelemetry-demo-adservice-fb...', requests: '69.1M', errorRate: 25.33, duration: 10.39 },
    { type: 'Infra', name: 'opentelemetry-demo-adservice-b5...', requests: '36.8M', errorRate: 27.78, duration: 7.22 },
  ]
};

const Telemetry: React.FC<TelemetryProps> = ({ resourceName, namespace, kind, onClose }) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const navigate = useNavigate();

  const handleCopyResourceName = async () => {
    try {
      await navigator.clipboard.writeText(resourceName);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleNamespaceClick = () => {
    navigate(`/dashboard/explore/namespaces/${namespace}`);
  };

  return (
    <>
      <DrawerHeader onClose={onClose}>
        <div className="py-2">
          <div className='text-sm flex items-center gap-1'>
            <h2 className="font-light text-gray-800 dark:text-gray-200">
              {kind}
            </h2>
            <span className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-600 cursor-pointer">
              {resourceName}
            </span>
            {copied ? (
              <CheckCheck className='h-4 w-4 ml-1 text-green-500' />
            ) : (
              <CopyIcon
                className='h-4 w-4 ml-1 text-gray-600 dark:text-gray-500 cursor-pointer hover:text-blue-500'
                onClick={handleCopyResourceName}
              />
            )}

          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-xs text-blue-500 dark:text-blue-500 cursor-pointer hover:underline"
              onClick={handleNamespaceClick}
            >
              {namespace}
            </span>
          </div>
        </div>
      </DrawerHeader>

      <DrawerContent>
        <div className="space-y-4">
          <Tabs defaultValue="overview" className="w-full ">
            <div className="px-4 py-2 flex items-center justify-between">
              <TabsList className="dark:bg-transparent text-sm">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="Metrics">Metrics</TabsTrigger>
                <TabsTrigger value="traces">Traces</TabsTrigger>
                <TabsTrigger value="requests">Requests</TabsTrigger>
                <TabsTrigger value="errors">Errors</TabsTrigger>
                <TabsTrigger value="duration">Duration</TabsTrigger>
              </TabsList>

              <Button className='flex justify-between w-44'>Drilldown <ArrowUpRight /></Button>
            </div>

            <div className='px-4 space-y-2'>
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 dark:border-gray-700/30"
                />
              </div>

              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* Metrics Grid */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-white dark:bg-gray-800/20 rounded-md p-4">
                    <div className="uppercase text-xs text-gray-500 mb-1">Request total</div>
                    <div className="text-4xl font-light text-gray-900 dark:text-white">
                      {MOCK_SERVICE_DATA.requestTotal}
                    </div>
                    <div className="text-xs text-gray-500">
                      {MOCK_SERVICE_DATA.requestPercentage}%
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800/20 rounded-lg p-4">
                    <div className="uppercase text-xs text-gray-500 mb-1">Error percentage</div>
                    <div className="text-4xl font-light text-red-400">
                      {MOCK_SERVICE_DATA.errorPercentage}%
                    </div>
                    <div className="text-xs text-gray-500">100%</div>
                  </div>

                  <div className="bg-white dark:bg-gray-800/20 rounded-lg p-4">
                    <div className="uppercase text-xs text-gray-500 mb-1">Duration average</div>
                    <div className="text-4xl font-light text-gray-900 dark:text-white">
                      {MOCK_SERVICE_DATA.durationAverage}
                    </div>
                    <div className="text-xs text-gray-500">
                      {MOCK_SERVICE_DATA.durationUnit}
                    </div>
                  </div>
                </div>

                {/* Summary Container */}
                <div className="bg-gray-200 dark:bg-gray-800/20 rounded-lg">
                  <div className='py-2 px-4 dark:bg-gray-800/40 rounded-t-lg'>
                    <h3 className="uppercase text-xs font-medium text-gray-800 dark:text-gray-500">
                      Summary
                    </h3>
                  </div>

                  <div className="space-y-2 text-sm p-4">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Service</span>
                      <span className="text-gray-900 dark:text-white">
                        {MOCK_SERVICE_DATA.summary.service}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Runtime</span>
                      <span className="text-gray-900 dark:text-white flex gap-1 items-center">
                        <SiNodedotjs className='h-4 w-4' />
                        {MOCK_SERVICE_DATA.summary.runtime}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Platform</span>
                      <span className="text-gray-900 dark:text-white flex gap-1 items-center">
                        <SiKubernetes className='h-4 w-4' />
                        {MOCK_SERVICE_DATA.summary.platform}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Cloud</span>
                      <span className="text-gray-900 dark:text-white flex gap-1 items-center">
                        <SiGooglecloud className='h-4 w-4' />
                        {MOCK_SERVICE_DATA.summary.cloud}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Operations Container */}
                <div className="bg-gray-200 dark:bg-gray-800/20 rounded-lg">
                  <div className='py-2 px-4 dark:bg-gray-800/40 rounded-t-lg'>
                    <h3 className="uppercase text-xs font-medium text-gray-800 dark:text-gray-500">
                      Operations
                    </h3>
                  </div>

                  <div className="overflow-x-auto p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-xs">
                          <th className="text-left py-2 text-gray-500">Type</th>
                          <th className="text-left py-2 text-gray-500">Name</th>
                          <th className="text-right py-2 text-gray-500">Requests</th>
                          <th className="text-right py-2 text-gray-500">Error Rate</th>
                          <th className="text-right py-2 text-gray-500">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MOCK_SERVICE_DATA.operations.map((op, index) => (
                          <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="py-2">
                              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-xs">
                                {op.type}
                              </span>
                            </td>
                            <td className="py-2 text-gray-900 dark:text-white">{op.name}</td>
                            <td className="py-2 text-right text-gray-900 dark:text-white">{op.requests}</td>
                            <td className="py-2 text-right text-red-400">{op.errorRate}</td>
                            <td className="py-2 text-right text-gray-900 dark:text-white">{op.duration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Resources Container */}
                <div className="bg-gray-200 dark:bg-gray-800/20 rounded-lg">
                  <div className='py-2 px-4 dark:bg-gray-800/40 rounded-t-lg'>
                    <h3 className="uppercase text-xs font-medium text-gray-800 dark:text-gray-500">
                      Resources
                    </h3>
                  </div>
                  <div className="overflow-x-auto p-4">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-xs">
                          <th className="text-left py-2 text-gray-500">Type</th>
                          <th className="text-left py-2 text-gray-500">Name</th>
                          <th className="text-right py-2 text-gray-500">Requests</th>
                          <th className="text-right py-2 text-gray-500">Error Rate</th>
                          <th className="text-right py-2 text-gray-500">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MOCK_SERVICE_DATA.resources.map((resource, index) => (
                          <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="py-2">
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded text-xs">
                                {resource.type}
                              </span>
                            </td>
                            <td className="py-2 text-gray-900 dark:text-white">{resource.name}</td>
                            <td className="py-2 text-right text-gray-900 dark:text-white">{resource.requests}</td>
                            <td className="py-2 text-right text-red-400">{resource.errorRate}</td>
                            <td className="py-2 text-right text-gray-900 dark:text-white">{resource.duration}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="Metrics" className="mt-4">
                <Metrics resourceName={resourceName} namespace={namespace} kind={kind} />
              </TabsContent>

              <TabsContent value="traces" className="mt-4 px-1">
                <Tracing resourceName={resourceName} namespace={namespace} />
              </TabsContent>

              <TabsContent value="requests" className="mt-4">
                <div className="p-4 text-center text-gray-500">
                  Request data will be displayed here
                </div>
              </TabsContent>

              <TabsContent value="errors" className="mt-4">
                <div className="p-4 text-center text-gray-500">
                  Error data will be displayed here
                </div>
              </TabsContent>

              <TabsContent value="duration" className="mt-4">
                <div className="p-4 text-center text-gray-500">
                  Duration data will be displayed here
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DrawerContent>
    </>
  );
};

export default Telemetry;