import React, { useState } from 'react';
import { ArrowUpRight, CheckCheck, CopyIcon, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import Tracing from './tracing.component';
import Metrics from './metrics.component';
import TelemetryOverview from './telemety-overview.component';
import Recommendation from './recommendation.component';

interface TelemetryProps {
  resourceName: string;
  namespace: string;
  kind: string;
  onClose: () => void;
}


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
                <TabsTrigger value="recommendation">Recommendation</TabsTrigger>
                {/* <TabsTrigger value="traces">Traces</TabsTrigger> */}
                {/* <TabsTrigger value="requests">Requests</TabsTrigger> */}
                {/* <TabsTrigger value="errors">Errors</TabsTrigger> */}
                {/* <TabsTrigger value="duration">Duration</TabsTrigger> */}
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

              <TabsContent value="overview" className="mt-4">
                <TelemetryOverview resourceName={resourceName} namespace={namespace} kind={kind} />
              </TabsContent>

              <TabsContent value="Metrics" className="mt-4">
                <Metrics resourceName={resourceName} namespace={namespace} kind={kind} />
              </TabsContent>

              <TabsContent value="recommendation" className="mt-4">
                <Recommendation resourceName={resourceName} namespace={namespace} kind={kind} />
              </TabsContent>

              <TabsContent value="traces" className="mt-4 px-1">
                {/* <Tracing resourceName={resourceName} namespace={namespace} /> */}
                <div className="p-4 text-center text-gray-500">
                  Request data will be displayed here
                </div>
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