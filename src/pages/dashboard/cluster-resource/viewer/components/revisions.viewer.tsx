import React, { useEffect, useState } from 'react';
import { kubeProxyRequest } from '@/api/cluster';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';
import { OPERATOR_URL } from '@/config';
import { fetch } from '@tauri-apps/plugin-http';
import { calculateAge } from '@/utils/age';
import { useNavigate } from 'react-router-dom';

// UI Components
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DeletionDialog, ResourceFilterSidebar, type ColumnConfig } from '@/components/custom';
import { AlertCircle, MoreVertical, Trash2, RotateCcw, RefreshCw, Filter } from 'lucide-react';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

interface RevisionsViewerProps {
  clusterName: string;
  namespace: string;
  resourceType: 'deployment' | 'statefulset' | 'daemonset';
  resourceName: string;
  labels?: Record<string, string>;
}

interface Revision {
  name: string;
  revision: number;
  replicas?: number;
  readyReplicas?: number;
  availableReplicas?: number;
  images: string[];
  createdAt: string;
  age: string;
  isCurrent: boolean;
  resourceType: 'replicaset' | 'controllerrevision';
}

const RevisionsViewer: React.FC<RevisionsViewerProps> = ({
  clusterName,
  namespace,
  resourceType,
  resourceName,
  labels
}) => {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [revisionToDelete, setRevisionToDelete] = useState<Revision | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [rolloutLoading, setRolloutLoading] = useState<string | null>(null);
  const [showFilterSidebar, setShowFilterSidebar] = useState(false);
  const { isReconMode } = useReconMode();
  const navigate = useNavigate();

  // Default column configuration for deployment revisions
  const defaultColumnConfig: ColumnConfig[] = resourceType === 'deployment' ? [
    { key: 'revision', label: 'Revision', visible: true, canToggle: false },
    { key: 'name', label: 'Name', visible: true, canToggle: false },
    { key: 'replicas', label: 'Replicas', visible: true, canToggle: true },
    { key: 'ready', label: 'Ready', visible: true, canToggle: true },
    { key: 'available', label: 'Available', visible: true, canToggle: true },
    { key: 'images', label: 'Images', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'status', label: 'Status', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false }
  ] : [
    { key: 'revision', label: 'Revision', visible: true, canToggle: false },
    { key: 'name', label: 'Name', visible: true, canToggle: false },
    { key: 'images', label: 'Images', visible: true, canToggle: true },
    { key: 'age', label: 'Age', visible: true, canToggle: true },
    { key: 'status', label: 'Status', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false }
  ];

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig(`revisions-${resourceType}`, defaultColumnConfig)
  );

  // Fetch revisions based on resource type
  const fetchRevisions = async () => {
    if (!clusterName || !namespace || !resourceName) return;

    try {
      setLoading(true);
      setError(null);

      let revisionData: Revision[] = [];

      if (resourceType === 'deployment') {
        // Fetch ReplicaSets for Deployment
        const path = `apis/apps/v1/namespaces/${namespace}/replicasets`;
        const response = await kubeProxyRequest(clusterName, path, 'GET');
        const replicaSets = response.items || [];

        // Filter ReplicaSets owned by this deployment
        const ownedReplicaSets = replicaSets.filter((rs: any) => {
          const ownerRefs = rs.metadata?.ownerReferences || [];
          return ownerRefs.some((ref: any) =>
            ref.kind === 'Deployment' &&
            ref.name === resourceName
          );
        });

        // Convert to Revision format
        revisionData = ownedReplicaSets.map((rs: any) => {
          const revision = parseInt(rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] || '0');
          const containers = rs.spec?.template?.spec?.containers || [];
          const images = containers.map((c: any) => c.image || '').filter(Boolean);
          const createdAt = rs.metadata?.creationTimestamp || '';

          return {
            name: rs.metadata?.name || '',
            revision,
            replicas: rs.status?.replicas || 0,
            readyReplicas: rs.status?.readyReplicas || 0,
            availableReplicas: rs.status?.availableReplicas || 0,
            images,
            createdAt,
            age: calculateAge(createdAt),
            isCurrent: (rs.status?.replicas || 0) > 0,
            resourceType: 'replicaset' as const
          };
        }).sort((a: Revision, b: Revision) => b.revision - a.revision);

      } else {
        // Fetch ControllerRevisions for StatefulSet and DaemonSet
        const path = `apis/apps/v1/namespaces/${namespace}/controllerrevisions`;
        const response = await kubeProxyRequest(clusterName, path, 'GET');
        const controllerRevisions = response.items || [];

        // Filter ControllerRevisions owned by this resource
        const ownedRevisions = controllerRevisions.filter((cr: any) => {
          const ownerRefs = cr.metadata?.ownerReferences || [];
          return ownerRefs.some((ref: any) =>
            ref.kind === (resourceType === 'statefulset' ? 'StatefulSet' : 'DaemonSet') &&
            ref.name === resourceName
          );
        });

        // Convert to Revision format
        revisionData = ownedRevisions.map((cr: any) => {
          const revision = cr.revision || 0;
          const createdAt = cr.metadata?.creationTimestamp || '';

          // Extract images from the revision data if available
          const containers = cr.data?.spec?.template?.spec?.containers || [];
          const images = containers.map((c: any) => c.image || '').filter(Boolean);

          return {
            name: cr.metadata?.name || '',
            revision,
            images,
            createdAt,
            age: calculateAge(createdAt),
            isCurrent: false, // We'll need to determine this differently for StatefulSets/DaemonSets
            resourceType: 'controllerrevision' as const
          };
        }).sort((a: Revision, b: Revision) => b.revision - a.revision);

        // Mark the latest revision as current
        if (revisionData.length > 0) {
          revisionData[0].isCurrent = true;
        }
      }

      setRevisions(revisionData);
    } catch (err) {
      console.error('Error fetching revisions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch revisions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRevisions();
  }, [clusterName, namespace, resourceType, resourceName, labels]);

  const handleRefresh = () => {
    fetchRevisions();
  };

  const handleDelete = (revision: Revision) => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    if (revision.isCurrent && resourceType === 'deployment') {
      toast({
        title: "Cannot Delete",
        description: "Cannot delete the current active revision. Please scale down the deployment first.",
        variant: "destructive"
      });
      return;
    }

    setRevisionToDelete(revision);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!revisionToDelete) return;

    try {
      setDeleteLoading(true);

      const resourceType = revisionToDelete.resourceType === 'replicaset' ? 'replicasets' : 'controllerrevisions';
      const path = `apis/apps/v1/namespaces/${namespace}/${resourceType}/${revisionToDelete.name}`;

      await kubeProxyRequest(clusterName, path, 'DELETE');

      toast({
        title: "Revision Deleted",
        description: `Successfully deleted revision ${revisionToDelete.revision}`,
      });

      // Refresh the list
      await fetchRevisions();
    } catch (err) {
      console.error('Error deleting revision:', err);
      toast({
        title: "Delete Failed",
        description: err instanceof Error ? err.message : 'Failed to delete revision',
        variant: "destructive"
      });
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
      setRevisionToDelete(null);
    }
  };

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col =>
        col.key === columnKey ? { ...col, visible } : col
      );
      saveColumnConfig(`revisions-${resourceType}`, updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    saveColumnConfig(`revisions-${resourceType}`, reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig(`revisions-${resourceType}`);
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column?.visible ?? true;
  };

  const handleRollback = async (revision: Revision) => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }

    if (resourceType !== 'deployment') {
      toast({
        title: "Not Supported",
        description: "Rollback is currently only supported for Deployments.",
        variant: "destructive"
      });
      return;
    }

    try {
      setRolloutLoading(revision.name);

      // Perform rollback by patching the deployment with the desired revision's template
      const path = `apis/apps/v1/namespaces/${namespace}/replicasets/${revision.name}`;
      const replicaSet = await kubeProxyRequest(clusterName, path, 'GET');

      // Create a patch that updates the deployment's template to match the ReplicaSet's template
      const patchBody = {
        spec: {
          template: replicaSet.spec.template
        }
      };

      // Apply the patch to trigger rollback using the correct Content-Type header
      const deploymentPath = `apis/apps/v1/namespaces/${namespace}/deployments/${resourceName}`;
      const response = await fetch(`${OPERATOR_URL}/clusters/${clusterName}/${deploymentPath}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/strategic-merge-patch+json',
        },
        body: JSON.stringify(patchBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to rollback deployment: ${errorText}`);
      }

      toast({
        title: "Rollback Initiated",
        description: `Rolling back ${resourceName} to revision ${revision.revision}`,
      });

      // Refresh after a delay to allow the rollback to propagate
      setTimeout(() => {
        fetchRevisions();
      }, 2000);

    } catch (err) {
      console.error('Error rolling back:', err);
      toast({
        title: "Rollback Failed",
        description: err instanceof Error ? err.message : 'Failed to rollback',
        variant: "destructive"
      });
    } finally {
      setRolloutLoading(null);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error loading revisions</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-transparent p-4">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium">Revision History</h2>
          </div>
          <Button
            variant="ghost"
            onClick={() => setShowFilterSidebar(true)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
          </Button>
        </div>

        {/* Revisions Table */}
        <div className="rounded-lg border-gray-200 dark:border-gray-800">
          <Table>
            <TableHeader>
              <TableRow>
                {columnConfig.map((col) => col.visible && (
                  <TableHead key={col.key} className={col.key === 'actions' ? 'text-right' : ''}>
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {revisions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnConfig.filter(col => col.visible).length} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    No revision history is available for this {resourceType}.
                  </TableCell>
                </TableRow>
              ) : (
                revisions.map((revision) => (
                  <TableRow key={revision.name}>
                    {columnConfig.map((col) => {
                      if (!col.visible) return null;

                      switch (col.key) {
                        case 'revision':
                          return (
                            <TableCell key={col.key} className="font-medium hover:text-blue-400 text-blue-500">
                              #{revision.revision}
                            </TableCell>
                          );

                        case 'name':
                          return (
                            <TableCell key={col.key} className="text-xs">
                              {revision.resourceType === 'replicaset' ? (
                                <span
                                  className="hover:text-blue-400 text-blue-500 hover:underline cursor-pointer"
                                  onClick={() => navigate(`/dashboard/explore/replicasets/${namespace}/${revision.name}`)}
                                >
                                  {revision.name}
                                </span>
                              ) : (
                                <span>{revision.name}</span>
                              )}
                            </TableCell>
                          );

                        case 'replicas':
                          return resourceType === 'deployment' ? (
                            <TableCell key={col.key}>{revision.replicas || 0}</TableCell>
                          ) : null;

                        case 'ready':
                          return resourceType === 'deployment' ? (
                            <TableCell key={col.key}>{revision.readyReplicas || 0}</TableCell>
                          ) : null;

                        case 'available':
                          return resourceType === 'deployment' ? (
                            <TableCell key={col.key}>{revision.availableReplicas || 0}</TableCell>
                          ) : null;

                        case 'images':
                          return (
                            <TableCell key={col.key}>
                              <div className="flex flex-col gap-1 max-w-md">
                                {revision.images.length > 0 ? (
                                  revision.images.map((image, idx) => (
                                    <div
                                      key={idx}
                                      className="text-xs font-mono bg-gray-100 dark:bg-gray-800/50 dark:text-gray-400 px-1.5 py-0.5 w-fit max-w-32 truncate rounded"
                                    >
                                      {image}
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-gray-400 text-xs">No images</span>
                                )}
                              </div>
                            </TableCell>
                          );

                        case 'age':
                          return (
                            <TableCell key={col.key} className="text-sm">
                              {revision.age}
                            </TableCell>
                          );

                        case 'status':
                          return (
                            <TableCell key={col.key}>
                              {revision.isCurrent ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                  Current
                                </Badge>
                              ) : (
                                <Badge variant="outline">Historical</Badge>
                              )}
                            </TableCell>
                          );

                        case 'actions':
                          return (
                            <TableCell key={col.key} className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="sm">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className='dark:bg-card/40 backdrop-blur-md border-gray-800/50'>
                                  {resourceType === 'deployment' && !revision.isCurrent && (
                                    <>
                                      <DropdownMenuItem
                                        onClick={() => handleRollback(revision)}
                                        disabled={rolloutLoading !== null}
                                      >
                                        <RotateCcw className="h-4 w-4 mr-2" />
                                        Rollback to this revision
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(revision)}
                                    className="text-red-600 dark:text-red-400"
                                    disabled={revision.isCurrent && resourceType === 'deployment'}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          );

                        default:
                          return null;
                      }
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Delete Confirmation Dialog */}
        {revisionToDelete && (
          <DeletionDialog
            isOpen={deleteDialogOpen}
            onClose={() => {
              setDeleteDialogOpen(false);
              setRevisionToDelete(null);
            }}
            onConfirm={confirmDelete}
            title="Delete Revision"
            description={`Are you sure you want to delete revision #${revisionToDelete.revision} (${revisionToDelete.name})? This action cannot be undone.`}
            resourceName={revisionToDelete.name}
            resourceType={revisionToDelete.resourceType === 'replicaset' ? 'ReplicaSet' : 'ControllerRevision'}
            isLoading={deleteLoading}
          />
        )}

        {/* Resource Filter Sidebar */}
        <ResourceFilterSidebar
          isOpen={showFilterSidebar}
          onClose={() => setShowFilterSidebar(false)}
          title="Revisions Table"
          columns={columnConfig}
          onColumnToggle={handleColumnToggle}
          onColumnReorder={handleColumnReorder}
          onResetToDefault={handleResetToDefault}
          className="w-1/3"
          resourceType={`revisions-${resourceType}`}
        />
      </div>
    </div>
  );
};

export default RevisionsViewer;
