import React, { useEffect, useState } from 'react';
import { V1Endpoints, V1Pod } from '@kubernetes/client-node';
import { getResource, listResources } from '@/api/internal/resources';
import { Loader2, RefreshCw, AlertCircle, Server, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { calculateAge } from '@/utils/age';

interface ServiceEndpointsProps {
  serviceName: string;
  namespace: string;
  clusterName: string;
}

const ServiceEndpoints: React.FC<ServiceEndpointsProps> = ({ 
  serviceName, 
  namespace, 
  clusterName 
}) => {
  const [endpoints, setEndpoints] = useState<V1Endpoints | null>(null);
  const [endpointPods, setEndpointPods] = useState<V1Pod[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEndpointsData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch the endpoints resource with the same name as the service
      const endpointsData = await getResource<'endpoints'>(
        clusterName,
        'endpoints',
        serviceName,
        namespace
      );

      setEndpoints(endpointsData);

      // Extract pod IPs from endpoints
      const podIPs: string[] = [];
      endpointsData.subsets?.forEach((subset: any) => {
        subset.addresses?.forEach((address: any) => {
          if (address.ip) {
            podIPs.push(address.ip);
          }
        });
      });

      // If we have pod references in the endpoints, fetch the pods
      if (podIPs.length > 0) {
        const podsData = await listResources<'pods'>(
          clusterName,
          'pods',
          { namespace }
        );

        // Filter pods that match the IPs in the endpoints
        const matchingPods = podsData.filter(pod => 
          pod.status?.podIP && podIPs.includes(pod.status.podIP)
        );

        setEndpointPods(matchingPods);
      }
    } catch (err) {
      console.error('Error fetching endpoints:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch endpoints data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEndpointsData();
  }, [serviceName, namespace, clusterName]);

  const handleRefresh = () => {
    fetchEndpointsData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="my-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!endpoints || !endpoints.subsets || endpoints.subsets.length === 0) {
    return (
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium">Endpoints</h2>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
          <Alert>
            <AlertDescription>
              No endpoints found for this service. The service might not be selecting any pods, or the selected pods might not be ready.
            </AlertDescription>
          </Alert>
        </div>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium">Endpoints</h2>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* Endpoints Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Server className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-medium">Endpoint Subsets</h3>
            </div>
            <div className="text-2xl font-semibold">
              {endpoints.subsets?.length || 0}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Network className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-medium">Total Addresses</h3>
            </div>
            <div className="text-2xl font-semibold">
              {endpoints.subsets?.reduce((acc, subset) => acc + (subset.addresses?.length || 0), 0) || 0}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <h3 className="text-sm font-medium">Not Ready</h3>
            </div>
            <div className="text-2xl font-semibold">
              {endpoints.subsets?.reduce((acc, subset) => acc + (subset.notReadyAddresses?.length || 0), 0) || 0}
            </div>
          </div>
        </div>

        {/* Subsets Table */}
        <div className="mb-6">
          <h3 className="text-md font-medium mb-3">Endpoint Subsets</h3>
          <div className="rounded-md border">
            <Table className="bg-gray-50 dark:bg-transparent rounded-md">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead className="text-center">Subset</TableHead>
                  <TableHead className="text-center">Ports</TableHead>
                  <TableHead className="text-center">Addresses</TableHead>
                  <TableHead className="text-center">Not Ready</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.subsets?.map((subset, index) => (
                  <TableRow 
                    key={index}
                    className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80"
                  >
                    <TableCell className="text-center font-medium">
                      Subset {index + 1}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {subset.ports?.map((port, portIndex) => (
                          <Badge 
                            key={portIndex}
                            variant="outline"
                            className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800/50"
                          >
                            {port.name ? `${port.name}: ` : ''}{port.port}/{port.protocol || 'TCP'}
                          </Badge>
                        )) || <span className="text-gray-500">No ports</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {subset.addresses?.length || 0}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">
                        {subset.notReadyAddresses?.length || 0}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Endpoint Addresses */}
        <div>
          <h3 className="text-md font-medium mb-3">Endpoint Addresses</h3>
          <div className="rounded-md border">
            <Table className="bg-gray-50 dark:bg-transparent rounded-md">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead>IP Address</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Node</TableHead>
                  <TableHead>Ready</TableHead>
                  <TableHead>Pod</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.subsets?.flatMap((subset, subsetIndex) => {
                  const readyAddresses = subset.addresses?.map(address => ({ ...address, ready: true })) || [];
                  const notReadyAddresses = subset.notReadyAddresses?.map(address => ({ ...address, ready: false })) || [];
                  const allAddresses = [...readyAddresses, ...notReadyAddresses];
                  
                  return allAddresses.map((address, addrIndex) => {
                    const matchingPod = endpointPods.find(pod => 
                      pod.status?.podIP === address.ip || 
                      pod.metadata?.name === address.targetRef?.name
                    );
                    
                    return (
                      <TableRow 
                        key={`${subsetIndex}-${addrIndex}`}
                        className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80"
                      >
                        <TableCell className="font-mono text-sm">
                          {address.ip}
                        </TableCell>
                        <TableCell>
                          {address.targetRef ? (
                            <div>
                              <span className="text-sm">
                                {address.targetRef.kind}/{address.targetRef.name}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {address.nodeName ? (
                            <span className="text-sm">{address.nodeName}</span>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={address.ready ? 
                              "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : 
                              "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                            }
                          >
                            {address.ready ? "Ready" : "Not Ready"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {matchingPod ? (
                            <div className="text-sm">
                              <div className="font-medium">{matchingPod.metadata?.name}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                Age: {calculateAge(matchingPod.metadata?.creationTimestamp?.toString())}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  });
                })}
                
                {(!endpoints.subsets || endpoints.subsets.flatMap(subset => 
                  [...(subset.addresses || []), ...(subset.notReadyAddresses || [])]
                ).length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">
                      No endpoint addresses found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default ServiceEndpoints;