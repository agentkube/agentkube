import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1PersistentVolumeClaim, V1PersistentVolume, CoreV1Event } from '@kubernetes/client-node';
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
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Define interface for PVC data
interface PVCData extends V1PersistentVolumeClaim {
  events?: CoreV1Event[];
  persistentVolume?: V1PersistentVolume;
}

const PersistentVolumeClaimViewer: React.FC = () => {
  const [pvcData, setPVCData] = useState<PVCData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { pvcName, namespace } = useParams<{ pvcName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();

  // Fetch events for the PVC
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      // Filter events related to this PVC
      const pvcEvents = eventData.filter(event =>
        event.involvedObject?.kind === 'PersistentVolumeClaim' &&
        event.involvedObject?.name === pvcName
      );

      setEvents(pvcEvents);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch persistent volume associated with this PVC
  const fetchPersistentVolume = async (volumeName: string) => {
    if (!currentContext || !volumeName) return;

    try {
      const pvData = await getResource<'persistentvolumes'>(
        currentContext.name,
        'persistentvolumes',
        volumeName
      );

      return pvData;
    } catch (err) {
      console.error('Error fetching persistent volume:', err);
      return null;
    }
  };

  // Fetch PVC data, events, and associated PV
  useEffect(() => {
    const fetchPVCData = async () => {
      if (!currentContext || !pvcName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get PVC details
        const data = await getResource<'persistentvolumeclaims'>(
          currentContext.name,
          'persistentvolumeclaims',
          pvcName,
          namespace
        );

        setPVCData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();

        // If PVC is bound to a PV, fetch PV details
        if (data.spec?.volumeName) {
          const pvData = await fetchPersistentVolume(data.spec.volumeName);
          if (pvData) {
            setPVCData(prevData => ({
              ...prevData as V1PersistentVolumeClaim,
              persistentVolume: pvData
            }));
          }
        }
      } catch (err) {
        console.error('Error fetching PVC:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch PersistentVolumeClaim data');
      } finally {
        setLoading(false);
      }
    };

    fetchPVCData();
  }, [currentContext, namespace, pvcName]);

  const handleDelete = () => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    setShowDeleteDialog(true);
  };

  const confirmResourceDeletion = async () => {
    if (!pvcData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'persistentvolumeclaims',
        pvcData.metadata?.name as string,
        {
          namespace: pvcData.metadata?.namespace
          // Note: PersistentVolumeClaims are in the core API group, so no apiGroup parameter needed
        }
      );

      // Navigate back to the persistent volume claims list
      navigate('/dashboard/explore/persistentvolumeclaims');
    } catch (err) {
      console.error('Failed to delete persistent volume claim:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete persistent volume claim');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && pvcName && namespace) {
      Promise.all([
        getResource<'persistentvolumeclaims'>(
          currentContext.name,
          'persistentvolumeclaims',
          pvcName,
          namespace
        ),
        fetchEvents()
      ]).then(async ([data]) => {
        setPVCData(data);

        // Fetch associated PV if bound
        if (data.spec?.volumeName) {
          const pvData = await fetchPersistentVolume(data.spec.volumeName);
          if (pvData) {
            setPVCData(prevData => ({
              ...prevData as V1PersistentVolumeClaim,
              persistentVolume: pvData
            }));
          }
        }

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

  // Get PVC status
  const getPVCStatus = () => {
    if (!pvcData) {
      return { status: 'Unknown', phase: 'Unknown' };
    }

    const phase = pvcData.status?.phase || 'Unknown';

    return { status: phase, phase };
  };

  // Get PVC age
  const getPVCAge = () => {
    if (!pvcData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(pvcData.metadata.creationTimestamp);
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

  // Get a color class based on the PVC phase
  const getStatusColorClass = (phase: string): string => {
    switch (phase) {
      case 'Bound':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'Lost':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
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
          <AlertTitle>Error loading PersistentVolumeClaim data</AlertTitle>
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

  // If no PVC data
  if (!pvcData || !pvcData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No PersistentVolumeClaim data available</AlertTitle>
          <AlertDescription>
            The requested PVC was not found or could not be retrieved.
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

  // Get PVC status
  const { status, phase } = getPVCStatus();
  const statusColor = getStatusColorClass(phase);
  return (
    <div className='max-h-[92vh] overflow-y-auto
          
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
              <BreadcrumbLink href="/dashboard/explore/persistentvolumeclaims">PersistentVolumeClaims</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/persistentvolumeclaims?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{pvcData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{pvcData.metadata.name}</h1>
                <Badge className={statusColor}>
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${pvcData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{pvcData.metadata.namespace}</span>
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

        {/* Status alert for pending PVCs */}
        {phase === 'Pending' && (
          <Alert className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
            <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle>PersistentVolumeClaim is Pending</AlertTitle>
            <AlertDescription>
              This PVC is waiting to be bound to a PersistentVolume. Check your storage class or available PVs.
            </AlertDescription>
          </Alert>
        )}

        {/* Status alert for lost PVCs */}
        {phase === 'Lost' && (
          <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>PersistentVolumeClaim is Lost</AlertTitle>
            <AlertDescription>
              This PVC has lost its bound volume. The volume may be deleted or unavailable. Data may be lost.
            </AlertDescription>
          </Alert>
        )}

        {pvcData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete PersistentVolumeClaim"
            description={`Are you sure you want to delete the persistent volume claim "${pvcData.metadata.name}" in namespace "${pvcData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={pvcData.metadata.name as string}
            resourceType="PersistentVolumeClaim"
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
          }} className="space-y-6 bg-transparent">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            {pvcData.persistentVolume && (
              <TabsTrigger value="volume">Volume</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* PVC Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-4xl font-light ${phase === 'Bound' ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {phase}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Claim Status
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Capacity</h3>
                </div>
                <div className="text-4xl font-light">
                  {formatStorage(pvcData.spec?.resources?.requests?.storage) || 'N/A'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Requested Storage
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Volume</h3>
                </div>
                <div className="text-4xl font-light truncate" title={pvcData.spec?.volumeName || 'Not bound'}>
                  {pvcData.spec?.volumeName || 'Not bound'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Bound PersistentVolume
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Age</h3>
                </div>
                <div className="text-4xl font-light">
                  {getPVCAge()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {formatDateTime(pvcData.metadata.creationTimestamp?.toString())}
                </div>
              </div>
            </div>

            {/* PVC Properties */}
            <PropertiesViewer
              metadata={pvcData.metadata}
              kind="PersistentVolumeClaim"
              status={phase}
              additionalProperties={[
                {
                  label: "Storage Class",
                  value: pvcData.spec?.storageClassName || 'default'
                },
                {
                  label: "Access Modes",
                  value: pvcData.spec?.accessModes?.join(', ') || 'None'
                },
                {
                  label: "Volume Mode",
                  value: pvcData.spec?.volumeMode || 'Filesystem'
                }
              ]}
            />

            {/* Storage Details */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Storage Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-2">Storage Specification</h3>
                  <table className="min-w-full text-sm">
                    <tbody>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Storage Class:</td>
                        <td className="py-1 font-medium">{pvcData.spec?.storageClassName || 'default'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Access Modes:</td>
                        <td className="py-1">
                          <div className="flex flex-wrap gap-1">
                            {pvcData.spec?.accessModes?.map((mode, index) => (
                              <Badge key={index} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                                {mode}
                              </Badge>
                            )) || 'None'}
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Volume Mode:</td>
                        <td className="py-1 font-medium">{pvcData.spec?.volumeMode || 'Filesystem'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Requested Storage:</td>
                        <td className="py-1 font-medium">{formatStorage(pvcData.spec?.resources?.requests?.storage) || 'N/A'}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Selector:</td>
                        <td className="py-1">
                          {pvcData.spec?.selector ? (
                            <div className="space-y-1">
                              {pvcData.spec.selector.matchLabels && Object.keys(pvcData.spec.selector.matchLabels).length > 0 && (
                                <div>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">MatchLabels:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {Object.entries(pvcData.spec.selector.matchLabels).map(([key, value]) => (
                                      <Badge key={key} variant="outline">
                                        {key}: {value}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {pvcData.spec.selector.matchExpressions && pvcData.spec.selector.matchExpressions.length > 0 && (
                                <div>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">MatchExpressions:</span>
                                  <div className="space-y-1 mt-1">
                                    {pvcData.spec.selector.matchExpressions.map((expr, index) => (
                                      <div key={index} className="text-xs bg-gray-100 dark:bg-gray-800 p-1 rounded">
                                        {expr.key} {expr.operator} {expr.values?.join(', ')}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">None</span>
                          )}
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
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Bound Volume:</td>
                        <td className="py-1">
                          {pvcData.spec?.volumeName ? (
                            <Button
                              variant="link"
                              className="p-0 h-auto text-blue-600 dark:text-blue-400 font-medium"
                              onClick={() => navigate(`/dashboard/explore/persistentvolumes/${pvcData.spec?.volumeName}`)}
                            >
                              {pvcData.spec.volumeName}
                            </Button>
                          ) : (
                            <span className="text-gray-500 dark:text-gray-400">Not bound</span>
                          )}
                        </td>
                      </tr>
                      {pvcData.status?.capacity?.storage && (
                        <tr>
                          <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Actual Capacity:</td>
                          <td className="py-1 font-medium">{formatStorage(pvcData.status.capacity.storage)}</td>
                        </tr>
                      )}
                      <tr>
                        <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Created:</td>
                        <td className="py-1 font-medium">{formatDateTime(pvcData.metadata.creationTimestamp?.toString())}</td>
                      </tr>
                    </tbody>
                  </table>

                  {phase === 'Bound' && pvcData.spec?.volumeName && (
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/dashboard/explore/persistentvolumes/${pvcData.spec?.volumeName}`)}
                      >
                        View Bound Volume
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mounted By Pods */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Mounted By Pods</h2>
              <div className="text-center p-4 text-gray-500 dark:text-gray-400">
                This feature requires additional implementation to list all pods using this PVC.
              </div>

              <div className="mt-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/dashboard/explore/pods?namespace=${namespace}&labelSelector=`)}
                >
                  View Namespace Pods
                </Button>
              </div>
            </div>

            {/* PVC Events */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <h2 className="text-lg font-medium mb-4">Events</h2>

              {events.length === 0 ? (
                <div className="text-center p-4 text-gray-500 dark:text-gray-400">
                  No events found for this PersistentVolumeClaim.
                </div>
              ) : (
                <EventsViewer
                  events={events}
                  resourceName={pvcData.metadata.name}
                  resourceKind="PersistentVolumeClaim"
                  namespace={pvcData.metadata.namespace}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={pvcData}
              namespace={pvcData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              resourceName={pvcData.metadata.name}
              resourceKind="PersistentVolumeClaim"
              namespace={pvcData.metadata.namespace}
            />
          </TabsContent>

          {pvcData.persistentVolume && (
            <TabsContent value="volume" className="space-y-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <h2 className="text-lg font-medium mb-4">Bound PersistentVolume</h2>

                <div className="mb-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-5 w-5 text-blue-500" />
                    <h3 className="text-xl font-semibold">{pvcData.persistentVolume.metadata?.name}</h3>
                    <Badge
                      className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    >
                      {pvcData.persistentVolume.status?.phase || 'Unknown'}
                    </Badge>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/dashboard/explore/persistentvolumes/${pvcData.persistentVolume?.metadata?.name}`)}
                  >
                    View Volume Details
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Volume Properties</h3>
                    <table className="min-w-full text-sm">
                      <tbody>
                        <tr>
                          <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Capacity:</td>
                          <td className="py-1 font-medium">
                            {formatStorage(pvcData.persistentVolume.spec?.capacity?.storage)}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Access Modes:</td>
                          <td className="py-1">
                            <div className="flex flex-wrap gap-1">
                              {pvcData.persistentVolume.spec?.accessModes?.map((mode, index) => (
                                <Badge key={index} className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                                  {mode}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Reclaim Policy:</td>
                          <td className="py-1">
                            <Badge className={
                              pvcData.persistentVolume.spec?.persistentVolumeReclaimPolicy === 'Delete'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                            }>
                              {pvcData.persistentVolume.spec?.persistentVolumeReclaimPolicy}
                            </Badge>
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Storage Class:</td>
                          <td className="py-1 font-medium">
                            {pvcData.persistentVolume.spec?.storageClassName || 'N/A'}
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
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                              {pvcData.persistentVolume.status?.phase || 'Unknown'}
                            </Badge>
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Claim:</td>
                          <td className="py-1 font-medium">
                            {pvcData.persistentVolume.spec?.claimRef ?
                              `${pvcData.persistentVolume.spec?.claimRef.namespace}/${pvcData.persistentVolume.spec?.claimRef.name}` :
                              'N/A'
                            }
                          </td>
                        </tr>
                        <tr>
                          <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">Created:</td>
                          <td className="py-1 font-medium">
                            {formatDateTime(pvcData.persistentVolume.metadata?.creationTimestamp?.toString())}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default PersistentVolumeClaimViewer;