import React, { useState, useEffect, useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Search, MoreVertical, RefreshCw, Plus, History, Package, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  HelmRelease,
  listHelmReleases,
  getHelmReleaseHistory,
  uninstallHelmRelease,
  getHelmActionStatus
} from '@/api/internal/helm';
import { useCluster } from '@/contexts/clusterContext';
import { DialogDescription } from '@radix-ui/react-dialog';
import { UninstallChartDialog } from '@/components/custom';
import { useNavigate } from 'react-router-dom';

// Function to calculate the age of a resource
const calculateAge = (timestamp: string): string => {
  if (!timestamp) return 'N/A';

  const created = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d`;

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours > 0) return `${hours}h`;

  const minutes = Math.floor(diffMs / (1000 * 60));
  return `${minutes}m`;
};

const HelmReleases: React.FC = () => {
  const { currentContext } = useCluster();
  const { toast } = useToast();
  const [releases, setReleases] = useState<HelmRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [namespace, setNamespace] = useState<string>("default"); // Default value to prevent empty string
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [showAllNamespaces, setShowAllNamespaces] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<{ [key: string]: boolean }>({});
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedRelease, setSelectedRelease] = useState<HelmRelease | null>(null);
  const [releaseHistory, setReleaseHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Uninstall dialog state
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);
  const [releaseToUninstall, setReleaseToUninstall] = useState<HelmRelease | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();

        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load releases when component mounts or when namespace/cluster changes
  useEffect(() => {
    const fetchReleases = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Handle potential API request errors gracefully
        let releaseData: HelmRelease[] = [];
        try {
          releaseData = await listHelmReleases(
            currentContext.name,
            showAllNamespaces ? undefined : namespace || undefined,
            showAllNamespaces
          );

        } catch (error) {
          console.error('Failed to fetch Helm releases:', error);
          // Provide a more friendly error message
          if (error instanceof Error && error.message.includes("is not valid JSON")) {
            throw new Error("Invalid response from server. The Helm API may not be configured correctly.");
          }
          throw error;
        }

        setReleases(releaseData);

        // Extract unique namespaces for the filter dropdown
        const uniqueNamespaces = Array.from(
          new Set(releaseData.map(r => r.namespace).filter(Boolean) as string[])
        );

        // Make sure we have a non-empty list
        if (uniqueNamespaces.length === 0) {
          uniqueNamespaces.push("default");
        }

        setNamespaces(uniqueNamespaces);
      } catch (err) {
        console.error('Failed to fetch Helm releases:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch Helm releases');
        // Default to empty array on error
        setReleases([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, [currentContext, namespace, showAllNamespaces]);

  // Filter releases based on search query
  const filteredReleases = useMemo(() => {
    if (!searchQuery.trim()) {
      return releases;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return releases.filter(release => {
      return (
        release.name.toLowerCase().includes(lowercaseQuery) ||
        release.namespace.toLowerCase().includes(lowercaseQuery) ||
        (release.appVersion && release.appVersion.toLowerCase().includes(lowercaseQuery))
      );
    });
  }, [releases, searchQuery]);

  // Handle namespace change
  const handleNamespaceChange = (value: string) => {
    setNamespace(value);
    setShowAllNamespaces(false);
  };

  // Toggle showing all namespaces
  const handleToggleAllNamespaces = () => {
    setShowAllNamespaces(!showAllNamespaces);
  };

  // viewing release history
  const handleViewHistory = async (release: HelmRelease) => {
    try {
      setSelectedRelease(release);
      setHistoryDialogOpen(true);
      setHistoryLoading(true);

      const history = await getHelmReleaseHistory(
        currentContext!.name,
        release.name,
        release.namespace
      );

      setReleaseHistory(history);
    } catch (err) {
      console.error('Failed to fetch release history:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to fetch release history',
        variant: "destructive"
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  // Handle upgrade release
  const handleUpgradeRelease = (release: HelmRelease) => {
    // Navigate to the upgrade form
    // This would typically open a modal or redirect to an upgrade page
    toast({
      title: "Not yet implemented",
      description: `Upgrade for ${release.name} will be available soon!`,
    });
  };

  // Handle uninstall release - opens dialog
  const handleUninstallRelease = (release: HelmRelease) => {
    setReleaseToUninstall(release);
    setUninstallDialogOpen(true);
  };

  // Confirm uninstall - actual uninstall logic
  const confirmUninstallRelease = async () => {
    if (!releaseToUninstall) return;

    try {
      // Mark this release as having an action in progress
      setActionInProgress(prev => ({ ...prev, [`${releaseToUninstall.namespace}/${releaseToUninstall.name}`]: true }));

      await uninstallHelmRelease(
        currentContext!.name,
        releaseToUninstall.name,
        releaseToUninstall.namespace
      );

      toast({
        title: "Uninstall started",
        description: `Uninstalling ${releaseToUninstall.name} from ${releaseToUninstall.namespace}...`,
      });

      // Start polling for status updates
      pollActionStatus(releaseToUninstall, 'uninstall');
    } catch (err) {
      console.error('Failed to uninstall release:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to uninstall release',
        variant: "destructive"
      });

      // Clear action in progress
      setActionInProgress(prev => ({ ...prev, [`${releaseToUninstall.namespace}/${releaseToUninstall.name}`]: false }));
    }
  };

  // Poll for action status updates
  const pollActionStatus = async (
    release: HelmRelease,
    action: 'install' | 'upgrade' | 'uninstall' | 'rollback'
  ) => {
    try {
      const key = `${release.namespace}/${release.name}`;
      const status = await getHelmActionStatus(
        currentContext!.name,
        release.name,
        action,
        release.namespace
      );

      if (status.status === 'success') {
        toast({
          title: "Success",
          description: `${action.charAt(0).toUpperCase() + action.slice(1)} completed for ${release.name}`,
        });

        // Refresh releases list with current view settings
        try {
          const updatedReleases = await listHelmReleases(
            currentContext!.name,
            showAllNamespaces ? undefined : namespace || undefined,
            showAllNamespaces
          );
          setReleases(updatedReleases);
        } catch (refreshError) {
          console.error('Failed to refresh releases after action:', refreshError);
          // If refresh fails, just remove the specific release for uninstall actions
          if (action === 'uninstall') {
            setReleases(prev => prev.filter(r => 
              !(r.name === release.name && r.namespace === release.namespace)
            ));
          }
        }

        // Clear action in progress
        setActionInProgress(prev => ({ ...prev, [key]: false }));
      } else if (status.status === 'failed') {
        toast({
          title: "Error",
          description: status.message || `Failed to ${action} release`,
          variant: "destructive"
        });

        // Clear action in progress
        setActionInProgress(prev => ({ ...prev, [key]: false }));
      } else {
        // Still processing, poll again in 2 seconds
        setTimeout(() => pollActionStatus(release, action), 2000);
      }
    } catch (err) {
      console.error(`Failed to check ${action} status:`, err);

      // Clear action in progress for this release
      const key = `${release.namespace}/${release.name}`;
      setActionInProgress(prev => ({ ...prev, [key]: false }));

      toast({
        title: "Error",
        description: `Failed to check ${action} status: ${err instanceof Error ? err.message : 'Unknown error'}`,
        variant: "destructive"
      });
    }
  };

  // Handle creating a new release
  const handleNewRelease = () => {
    // Navigate to the new release form
    // toast({
    //   title: "Not yet implemented",
    //   description: "Installing new Helm charts will be available soon!",
    // });
    navigate("/dashboard/explore/charts")
  };

  // Handle refresh
  const handleRefresh = async () => {
    try {
      setLoading(true);
      const refreshedReleases = await listHelmReleases(
        currentContext!.name,
        namespace || undefined,
        showAllNamespaces
      );
      setReleases(refreshedReleases);
      toast({
        title: "Refreshed",
        description: "Helm releases have been refreshed",
      });
    } catch (err) {
      console.error('Failed to refresh releases:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : 'Failed to refresh releases',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Check if a release has an action in progress
  const isActionInProgress = (release: HelmRelease): boolean => {
    return !!actionInProgress[`${release.namespace}/${release.name}`];
  };

  // Get status color class
  const getStatusColorClass = (status: string | undefined): string => {
    if (!status) {
      return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300'; // Default style for undefined/null status
    }

    switch (status.toLowerCase()) {
      case 'deployed':
        return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'failed':
        return 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'pending':
      case 'pending-install':
      case 'pending-upgrade':
        return 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'uninstalling':
        return 'bg-orange-200 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
      default:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
        
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="flex justify-between items-center md:flex-row gap-4">
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Helm Releases</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, chart, or namespace..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select value={namespace} onValueChange={handleNamespaceChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Namespace" />
            </SelectTrigger>
            <SelectContent className="bg-gray-100 dark:bg-gray-900/80 backdrop-blur-sm border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
              {/* Make sure we have a valid value for each item */}
              {namespaces.length > 0 && namespaces.map(ns => (
                <SelectItem key={ns} value={ns}>{ns}</SelectItem>
              ))}
              {namespaces.length === 0 && (
                <SelectItem value="default">default</SelectItem>
              )}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={handleToggleAllNamespaces}
            className={showAllNamespaces ? "bg-blue-100 dark:bg-transparent" : ""}
          >
            All Namespaces
          </Button>

          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>

          <Button onClick={handleNewRelease}>
            <Plus className="h-4 w-4 mr-2" />
            Install
          </Button>
        </div>
      </div>

      {error && (
        <Alert className="m-6 ">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!error && filteredReleases.length === 0 && (
        <Alert className="my-6">
          <AlertDescription>
            {searchQuery
              ? `No Helm releases matching "${searchQuery}"`
              : namespace && !showAllNamespaces
                ? `No Helm releases found in namespace "${namespace}"`
                : "No Helm releases found in this cluster"}
          </AlertDescription>
        </Alert>
      )}

      {/* History Dialog */}
      <Dialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        modal={true}
      >
        <DialogContent
          className="sm:max-w-3xl"
          onEscapeKeyDown={() => setHistoryDialogOpen(false)}
        >
          <DialogHeader>
            <DialogTitle>
              Release History: {selectedRelease?.name}
            </DialogTitle>
            <DialogDescription>
              View the revision history for this Helm release
            </DialogDescription>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Revision</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Chart</TableHead>
                    <TableHead>App Version</TableHead>
                    <TableHead>Updated</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releaseHistory.map((revision, index) => (
                    <TableRow key={revision.revision || index}>
                      <TableCell className="font-medium">{revision.version}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded text-xs ${getStatusColorClass(revision.status)}`}>
                          {revision?.info?.status}
                        </span>
                      </TableCell>
                      <TableCell>{revision.chart?.metadata?.name || 'Unknown'}</TableCell>
                      <TableCell>{revision.chart?.metadata?.appVersion || ''}</TableCell>
                      <TableCell>{calculateAge(revision.updated)}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {revision.info?.description || ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Uninstall Dialog */}
      <UninstallChartDialog
        open={uninstallDialogOpen}
        onOpenChange={setUninstallDialogOpen}
        release={releaseToUninstall}
        onConfirm={confirmUninstallRelease}
        isLoading={releaseToUninstall ? isActionInProgress(releaseToUninstall) : false}
      />

      {!error && filteredReleases.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">

          <div className="rounded-md border">
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead>Name</TableHead>
                  {(showAllNamespaces || !namespace) && <TableHead>Namespace</TableHead>}
                  <TableHead className="text-center">Version</TableHead>
                  <TableHead>Chart</TableHead>
                  <TableHead className="text-center">Revision</TableHead>
                  <TableHead className="text-center">App Version</TableHead>
                  <TableHead className="text-center">Updated</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReleases.map((release) => (
                  <TableRow
                    key={`${release.namespace}-${release.name}`}
                    className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        <Package className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <span>{release.name}</span>
                      </div>
                    </TableCell>
                    {(showAllNamespaces || !namespace) && (
                      <TableCell>
                       <span className='hover:text-blue-500 hover:underline cursor-pointer' onClick={() => navigate(`/dashboard/explore/namespaces/${release.namespace}`)}>
                        {release.namespace}
                       </span>
                      </TableCell>
                    )}
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 rounded-md text-xs font-medium ${getStatusColorClass(release.status)}`}>
                        {release.chart.metadata.version}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {typeof release.chart === 'string'
                          ? release.chart
                          : (release.chart && typeof release.chart === 'object' && 'metadata' in release.chart && release.chart.metadata?.name)
                            ? release.chart.metadata.name
                            : 'Unknown Chart'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {release.version}
                    </TableCell>
                    <TableCell className="text-center">
                      {release.chart.metadata.appVersion || ''}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(release.info.last_deployed)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={isActionInProgress(release)}
                          >
                            {isActionInProgress(release) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreVertical className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="dark:bg-[#0B0D13]/40 backdrop-blur-md border-gray-800/50">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleViewHistory(release)}>
                            <History className="mr-2 h-4 w-4" />
                            History
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleUpgradeRelease(release)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Upgrade
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-600 dark:text-red-400"
                            onClick={() => handleUninstallRelease(release)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Uninstall
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}


    </div>
  );
};

export default HelmReleases;