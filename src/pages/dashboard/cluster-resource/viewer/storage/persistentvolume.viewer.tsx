import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1PersistentVolume, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Database, HardDrive, Clock, Link2, Trash } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import ResourceViewerYamlTab from '@/components/custom/editor/resource-viewer-tabs.component';
import { useSearchParams } from 'react-router-dom';
import { DeletionDialog } from '@/components/custom';

// Define interface for PV data
interface PVData extends V1PersistentVolume {
  events?: CoreV1Event[];
}

const PersistentVolumeViewer: React.FC = () => {
  const [pvData, setPVData] = useState<PVData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { pvName } = useParams<{ pvName: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch events for the PV
  const fetchEvents = async () => {
    if (!currentContext) return;

    try {
      // Fetch all events in the cluster (PVs are cluster-scoped)
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events'
      );

      // Filter events related to this PV
      const pvEvents = eventData.filter(event =>
        event.involvedObject?.kind === 'PersistentVolume' &&
        event.involvedObject?.name === pvName
      );

      setEvents(pvEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch PV data and events
  useEffect(() => {
    const fetchPVData = async () => {
      if (!currentContext || !pvName) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get PV details
        const data = await getResource<'persistentvolumes'>(
          currentContext.name,
          'persistentvolumes',
          pvName
        );

        setPVData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching PV:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch PersistentVolume data');
      } finally {
        setLoading(false);
      }
    };

    fetchPVData();
  }, [currentContext, pvName]);

  const handleDelete = () => {
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!pvData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'persistentvolumes',
        pvData.metadata?.name as string,
        {
          // Note: PersistentVolumes are cluster-scoped, so no namespace parameter needed
          // PVs are in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the persistent volumes list
      navigate('/dashboard/explore/persistentvolumes');
    } catch (err) {
      console.error('Failed to delete persistent volume:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete persistent volume');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && pvName) {
      Promise.all([
        getResource<'persistentvolumes'>(
          currentContext.name,
          'persistentvolumes',
          pvName
        ),
        fetchEvents()
      ]).then(([data]) => {
        setPVData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Format storage size to human-readable format
  const formatStorage = (storage: string | undefined): string => {
    if (!storage) return 'N/A';

    // Return as is if it's already in a human-readable format
    if (storage.endsWith('Ki') || storage.endsWith('Mi') || storage.endsWith('Gi') || storage.endsWith('Ti')) {
      return storage;
    }

    // Try to parse as a number (bytes)
    const bytes = parseInt(storage);
    if (isNaN(bytes)) return storage;

    // Convert to appropriate unit
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} Ki`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} Mi`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Gi`;
  };

  // Helper function to determine the volume type from the spec
  const getVolumeType = (volume: V1PersistentVolume): string => {
    const spec = volume.spec;
    if (!spec) return 'Unknown';

    // Check for different volume types in order of likelihood
    if (spec.hostPath) return 'HostPath';
    if (spec.nfs) return 'NFS';
    if (spec.awsElasticBlockStore) return 'AWS EBS';
    if (spec.gcePersistentDisk) return 'GCE PD';
    if (spec.csi) return `CSI (${spec.csi.driver || 'unknown'})`;
    if (spec.iscsi) return 'iSCSI';
    if (spec.glusterfs) return 'GlusterFS';
    if (spec.rbd) return 'Ceph RBD';
    if (spec.cephfs) return 'CephFS';
    if (spec.azureDisk) return 'Azure Disk';
    if (spec.azureFile) return 'Azure File';
    if (spec.fc) return 'Fibre Channel';
    if (spec.local) return 'Local';

    // Check for other volume types
    const volumeKeys = Object.keys(spec).filter(key =>
      key !== 'accessModes' &&
      key !== 'persistentVolumeReclaimPolicy' &&
      key !== 'storageClassName' &&
      key !== 'volumeMode' &&
      key !== 'capacity' &&
      key !== 'nodeAffinity' &&
      key !== 'claimRef'
    );

    if (volumeKeys.length > 0) {
      return volumeKeys[0].charAt(0).toUpperCase() + volumeKeys[0].slice(1);
    }

    return 'Unknown';
  };

  // Get PV status
  const getPVStatus = () => {
    if (!pvData) {
      return { status: 'Unknown', phase: 'Unknown' };
    }

    const phase = pvData.status?.phase || 'Unknown';

    return { status: phase, phase };
  };

  // Get PV age
  const getPVAge = () => {
    if (!pvData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(pvData.metadata.creationTimestamp);
    const now = new Date();
    const ageMs = now.getTime() - creationTime.getTime();

    // Format age
    if (ageMs < 60000) {
      return `${Math.round(ageMs / 1000)}s`;
    } else if (ageMs < 3600000) {
      return `${Math.round(ageMs / 60000)}m`;
    } else if (ageMs < 86400000) {
      return `${Math.round(ageMs / 3600000)}h`;
    } else {
      return `${Math.round(ageMs / 86400000)}d`;
    }
  };

  // Get a color class based on the PV phase
  const getStatusColorClass = (phase: string): string => {
    switch (phase) {
      case 'Bound':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'Available':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'Released':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'Failed':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'Pending':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Format date time for display
  const formatDateTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Loading state
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-96 mb-8" />
        <Skeleton className="h-36 w-full mb-4" />
        <Skeleton className="h-48 w-full mb-4" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading PersistentVolume data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // If no PV data
  if (!pvData || !pvData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No PersistentVolume data available</AlertTitle>
          <AlertDescription>
            The requested PV was not found or could not be retrieved.
          </AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Get PV status
  const { status, phase } = getPVStatus();
  const statusColor = getStatusColorClass(phase);
  const volumeType = getVolumeType(pvData);
  const hasClaim = !!pvData.spec?.claimRef;
  const reclaimPolicy = pvData.spec?.persistentVolumeReclaimPolicy || 'Retain';

  return (
    <div className='
           max-h-[92vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
      <div className={`p-6 ${fullWidth ? 'max-w-full' : 'max-w-7xl'} mx-auto`}>
        {/* Breadcrumb navigation */}
        <Breadcrumb className="mb-6">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink>
                <div className='flex items-center gap-2'>
                  <img src={KUBERNETES_LOGO} alt='Kubernetes Logo' className='w-4 h-4' />
                  {currentContext?.name}
                </div>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard/explore/persistentvolumes">PersistentVolumes</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{pvData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{pvData.metadata.name}</h1>
                <Badge className={statusColor}>
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Type: <span className="text-gray-700 dark:text-gray-300">{volumeType}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-1.5" />
                Back
              </Button>
              <Button variant="outline" size="sm" className='hover:bg-red-600 dark:hover:bg-red-700' onClick={handleDelete}>
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Status alert for Released PVs */}
        {phase === 'Released' && (
          <Alert className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle>PersistentVolume is Released</AlertTitle>
            <AlertDescription>
              This PV was previously bound to a claim that has been deleted. The volume is no longer in use but is not yet available for another claim.
              {reclaimPolicy === 'Delete' && " It will be deleted automatically according to the Delete reclaim policy."}
              {reclaimPolicy === 'Retain' && " It will remain in this state until manually reclaimed by an administrator due to its Retain policy."}
            </AlertDescription>
          </Alert>
        )}

        {/* Status alert for Failed PVs */}
        {phase === 'Failed' && (
          <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>PersistentVolume is Failed</AlertTitle>
            <AlertDescription>
              This PV has failed its automatic reclamation. Manual intervention is required to reclaim this volume.
            </AlertDescription>
          </Alert>
        )}

        {pvData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete PersistentVolume"
            description={`Are you sure you want to delete the persistent volume "${pvData.metadata.name}"? This action cannot be undone.`}
            resourceName={pvData.metadata.name as string}
            resourceType="PersistentVolume"
            isLoading={deleteLoading}
          />
        )}

        {/* Main content tabs */}
        <Tabs
          defaultValue={defaultTab}
          onValueChange={(value) => {
            setSearchParams(params => {
              params.set('tab', value);
              return params;
            });
          }}
          className="space-y-6 bg-transparent">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* PV Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-lg font-semibold ${phase === 'Bound' || phase === 'Available'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-yellow-600 dark:text-yellow-400'
                  }`}>
                  {phase}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Volume Status
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Capacity</h3>
                </div>
                <div className="text-lg font-semibold">
                  {formatStorage(pvData.spec?.capacity?.storage) || 'N/A'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Total Storage
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Reclaim Policy</h3>
                </div>
                <div className="text-lg font-semibold">
                  <span className={reclaimPolicy === 'Delete' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                    {reclaimPolicy}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {reclaimPolicy === 'Delete'
                    ? 'Volume deleted when released'
                    : 'Volume preserved when released'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-lg font-semibold">
                  {getPVAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {formatDateTime(pvData.metadata.creationTimestamp?.toString())}
                </div>
              </div>
            </div>

            {/* PV Properties */}
            <PropertiesViewer
              metadata={pvData.metadata}
              kind="PersistentVolume"
              status={phase}
              additionalProperties={[
                {
                  label: "Storage Class",
                  value: pvData.spec?.storageClassName || 'N/A'
                },
                {
                  label: "Access Modes",
                  value: pvData.spec?.accessModes?.join(', ') || 'None'
                },
                {
                  label: "Volume Type",
                  value: volumeType
                },
                {
                  label: "Reclaim Policy",
                  value: reclaimPolicy
                }
              ]}
            />

            {/* Storage Details */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Storage Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium mb-2">Volume Specification</h3>
                  <table className="min-w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Type:</td>
                        <td className="py-1 font-medium">
                          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                            {volumeType}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Storage Class:</td>
                        <td className="py-1 font-medium">{pvData.spec?.storageClassName || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Access Modes:</td>
                        <td className="py-1">
                          <div className="flex flex-wrap gap-1">
                            {pvData.spec?.accessModes?.map((mode, index) => (
                              <Badge key={index} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                                {mode}
                              </Badge>
                            )) || 'None'}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Volume Mode:</td>
                        <td className="py-1 font-medium">{pvData.spec?.volumeMode || 'Filesystem'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Capacity:</td>
                        <td className="py-1 font-medium">{formatStorage(pvData.spec?.capacity?.storage) || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Reclaim Policy:</td>
                        <td className="py-1">
                          <Badge className={
                            reclaimPolicy === 'Delete'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                              : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                          }>
                            {reclaimPolicy}
                          </Badge>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-sm font-medium mb-2">Status</h3>
                  <table className="min-w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Phase:</td>
                        <td className="py-1">
                          <Badge className={statusColor}>
                            {phase}
                          </Badge>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Claim:</td>
                        <td className="py-1">
                          {pvData.spec?.claimRef ? (
                            <Button
                              variant="link"
                              className="p-0 h-auto text-blue-600 dark:text-blue-400 font-medium"
                              onClick={() => navigate(`/dashboard/explore/persistentvolumeclaims/${pvData.spec?.claimRef?.namespace}/${pvData.spec?.claimRef?.name}`)}
                            >
                              {pvData.spec.claimRef.namespace}/{pvData.spec.claimRef.name}
                            </Button>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">Not claimed</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Created:</td>
                        <td className="py-1 font-medium">{formatDateTime(pvData.metadata.creationTimestamp?.toString())}</td>
                      </tr>
                    </tbody>
                  </table>

                  {hasClaim && phase === 'Bound' && pvData.spec?.claimRef && (
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/dashboard/explore/persistentvolumeclaims/${pvData.spec?.claimRef?.namespace}/${pvData.spec?.claimRef?.name}`)}
                      >
                        View Bound Claim
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Volume Source Details */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Volume Source</h2>
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
                {renderVolumeSourceDetails(pvData)}
              </div>
            </div>

            {/* Node Affinity (if present) */}
            {pvData.spec?.nodeAffinity && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Node Affinity</h2>
                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
                  {renderNodeAffinity(pvData.spec.nodeAffinity)}
                </div>
              </div>
            )}

            {/* PV Events */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <h2 className="text-lg font-medium mb-4">Events</h2>

              {events.length === 0 ? (
                <div className="text-center p-4 text-gray-500 dark:text-gray-400">
                  No events found for this PersistentVolume.
                </div>
              ) : (
                <EventsViewer
                  events={events}
                  resourceName={pvData.metadata.name}
                  resourceKind="PersistentVolume"
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={pvData}
              namespace={pvData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              resourceName={pvData.metadata.name}
              resourceKind="PersistentVolume"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PersistentVolumeViewer;
// Helper function to render volume source details based on type
// Helper function to render volume source details based on type
const renderVolumeSourceDetails = (pvData: V1PersistentVolume) => {
  const spec = pvData.spec;
  if (!spec) return <div>No volume source information available</div>;

  // Check for different volume types and render appropriate details
  if (spec.hostPath) {
    return (
      <div>
        <h3 className="font-medium mb-2">HostPath</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Path: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.hostPath.path}</code>
        </div>
        {spec.hostPath.type && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Type: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.hostPath.type}</code>
          </div>
        )}
      </div>
    );
  }

  if (spec.nfs) {
    return (
      <div>
        <h3 className="font-medium mb-2">NFS</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Server: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.nfs.server}</code>
        </div>
        <div className="mt-1">
          <span className="text-gray-600 dark:text-gray-400">Path: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.nfs.path}</code>
        </div>
        {spec.nfs.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
      </div>
    );
  }

  if (spec.csi) {
    return (
      <div>
        <h3 className="font-medium mb-2">CSI</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Driver: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.csi.driver}</code>
        </div>
        {spec.csi.volumeHandle && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Volume Handle: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.csi.volumeHandle}</code>
          </div>
        )}
        {spec.csi.volumeAttributes && Object.keys(spec.csi.volumeAttributes).length > 0 && (
          <div className="mt-2">
            <span className="text-gray-600 dark:text-gray-400">Volume Attributes: </span>
            <div className="mt-1 space-y-1">
              {Object.entries(spec.csi.volumeAttributes).map(([key, value]) => (
                <div key={key} className="ml-4">
                  <span className="text-gray-600 dark:text-gray-400">{key}: </span>
                  <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{value}</code>
                </div>
              ))}
            </div>
          </div>
        )}
        {spec.csi.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
      </div>
    );
  }

  if (spec.awsElasticBlockStore) {
    return (
      <div>
        <h3 className="font-medium mb-2">AWS Elastic Block Store</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Volume ID: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.awsElasticBlockStore.volumeID}</code>
        </div>
        {spec.awsElasticBlockStore.fsType && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Filesystem Type: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.awsElasticBlockStore.fsType}</code>
          </div>
        )}
        {spec.awsElasticBlockStore.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
      </div>
    );
  }

  if (spec.gcePersistentDisk) {
    return (
      <div>
        <h3 className="font-medium mb-2">GCE Persistent Disk</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">PD Name: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.gcePersistentDisk.pdName}</code>
        </div>
        {spec.gcePersistentDisk.fsType && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Filesystem Type: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.gcePersistentDisk.fsType}</code>
          </div>
        )}
        {spec.gcePersistentDisk.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
      </div>
    );
  }

  if (spec.azureDisk) {
    return (
      <div>
        <h3 className="font-medium mb-2">Azure Disk</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Disk Name: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.azureDisk.diskName}</code>
        </div>
        <div className="mt-1">
          <span className="text-gray-600 dark:text-gray-400">Disk URI: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.azureDisk.diskURI}</code>
        </div>
        {spec.azureDisk.fsType && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Filesystem Type: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.azureDisk.fsType}</code>
          </div>
        )}
        {spec.azureDisk.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
        {spec.azureDisk.cachingMode && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Caching Mode: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.azureDisk.cachingMode}</code>
          </div>
        )}
      </div>
    );
  }

  if (spec.azureFile) {
    return (
      <div>
        <h3 className="font-medium mb-2">Azure File</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Secret Name: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.azureFile.secretName}</code>
        </div>
        <div className="mt-1">
          <span className="text-gray-600 dark:text-gray-400">Share Name: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.azureFile.shareName}</code>
        </div>
        {spec.azureFile.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
      </div>
    );
  }

  if (spec.local) {
    return (
      <div>
        <h3 className="font-medium mb-2">Local Volume</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Path: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.local.path}</code>
        </div>
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          <p>Local volumes require node affinity to be specified to constrain which node the volume is accessible from.</p>
        </div>
      </div>
    );
  }

  if (spec.iscsi) {
    return (
      <div>
        <h3 className="font-medium mb-2">iSCSI</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Target Portal: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.iscsi.targetPortal}</code>
        </div>
        <div className="mt-1">
          <span className="text-gray-600 dark:text-gray-400">IQN: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.iscsi.iqn}</code>
        </div>
        <div className="mt-1">
          <span className="text-gray-600 dark:text-gray-400">Lun: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.iscsi.lun}</code>
        </div>
        {spec.iscsi.fsType && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Filesystem Type: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.iscsi.fsType}</code>
          </div>
        )}
        {spec.iscsi.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
      </div>
    );
  }

  if (spec.rbd) {
    return (
      <div>
        <h3 className="font-medium mb-2">Ceph RBD (Rados Block Device)</h3>
        <div>
          <span className="text-gray-600 dark:text-gray-400">Monitors: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.rbd.monitors.join(',')}</code>
        </div>
        <div className="mt-1">
          <span className="text-gray-600 dark:text-gray-400">Image: </span>
          <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.rbd.image}</code>
        </div>
        {spec.rbd.pool && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Pool: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.rbd.pool}</code>
          </div>
        )}
        {spec.rbd.fsType && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Filesystem Type: </span>
            <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{spec.rbd.fsType}</code>
          </div>
        )}
        {spec.rbd.readOnly && (
          <div className="mt-1">
            <span className="text-gray-600 dark:text-gray-400">Read Only: </span>
            <span>Yes</span>
          </div>
        )}
      </div>
    );
  }

  // Check for other volume types
  const volumeKeys = Object.keys(spec).filter(key =>
    key !== 'accessModes' &&
    key !== 'persistentVolumeReclaimPolicy' &&
    key !== 'storageClassName' &&
    key !== 'volumeMode' &&
    key !== 'capacity' &&
    key !== 'nodeAffinity' &&
    key !== 'claimRef'
  );

  // If other volume type is found, render generic details
  if (volumeKeys.length > 0) {
    return (
      <div>
        <h3 className="font-medium mb-2">{volumeKeys[0].charAt(0).toUpperCase() + volumeKeys[0].slice(1)}</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Detailed rendering for this volume type is not implemented.
        </div>
        <div className="mt-2">
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto">
            {JSON.stringify((spec as any)[volumeKeys[0]], null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  return <div className="text-gray-600 dark:text-gray-400">Volume source details not available</div>;
};

// Helper function to render node affinity details
const renderNodeAffinity = (nodeAffinity: any) => {
  if (!nodeAffinity || !nodeAffinity.required) {
    return <div className="text-gray-600 dark:text-gray-400">No node affinity requirements specified</div>;
  }

  return (
    <div>
      <h3 className="font-medium mb-2">Required Node Selector Terms</h3>
      <div className="space-y-3">
        {nodeAffinity.required.nodeSelectorTerms.map((term: any, termIndex: number) => (
          <div key={termIndex} className="p-3 border border-gray-200 dark:border-gray-700 rounded">
            <h4 className="font-medium text-sm mb-2">Term {termIndex + 1}</h4>

            {term.matchExpressions && term.matchExpressions.length > 0 && (
              <div className="mb-2">
                <div className="text-sm font-medium mb-1">Match Expressions:</div>
                <div className="space-y-1 ml-2">
                  {term.matchExpressions.map((expr: any, exprIndex: number) => (
                    <div key={exprIndex} className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
                      <code>{expr.key} {expr.operator} {expr.values ? expr.values.join(', ') : ''}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {term.matchFields && term.matchFields.length > 0 && (
              <div>
                <div className="text-sm font-medium mb-1">Match Fields:</div>
                <div className="space-y-1 ml-2">
                  {term.matchFields.map((field: any, fieldIndex: number) => (
                    <div key={fieldIndex} className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
                      <code>{field.key} {field.operator} {field.values ? field.values.join(', ') : ''}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {nodeAffinity.preferred && nodeAffinity.preferred.length > 0 && (
        <div className="mt-4">
          <h3 className="font-medium mb-2">Preferred Node Affinity</h3>
          <div className="space-y-3">
            {nodeAffinity.preferred.map((pref: any, prefIndex: number) => (
              <div key={prefIndex} className="p-3 border border-gray-200 dark:border-gray-700 rounded">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium text-sm">Preference {prefIndex + 1}</h4>
                  <span className="text-sm bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 px-2 py-0.5 rounded">
                    Weight: {pref.weight}
                  </span>
                </div>

                {pref.preference.matchExpressions && pref.preference.matchExpressions.length > 0 && (
                  <div className="mt-2">
                    <div className="text-sm font-medium mb-1">Match Expressions:</div>
                    <div className="space-y-1 ml-2">
                      {pref.preference.matchExpressions.map((expr: any, exprIndex: number) => (
                        <div key={exprIndex} className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
                          <code>{expr.key} {expr.operator} {expr.values ? expr.values.join(', ') : ''}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pref.preference.matchFields && pref.preference.matchFields.length > 0 && (
                  <div className="mt-2">
                    <div className="text-sm font-medium mb-1">Match Fields:</div>
                    <div className="space-y-1 ml-2">
                      {pref.preference.matchFields.map((field: any, fieldIndex: number) => (
                        <div key={fieldIndex} className="bg-gray-100 dark:bg-gray-800 p-2 rounded text-sm">
                          <code>{field.key} {field.operator} {field.values ? field.values.join(', ') : ''}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};