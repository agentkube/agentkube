import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Play, Pause, Clock, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { V1CronJob } from '@kubernetes/client-node';
import { OPERATOR_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'status' | 'schedule' | 'lastSchedule' | 'activeJobs' | 'successful' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const CronJobs: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [cronJobs, setCronJobs] = useState<V1CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState(false);
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

  // --- Start of Multi-select ---
  const [selectedCronJobs, setSelectedCronJobs] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeCronJob, setActiveCronJob] = useState<any | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

  // Add click handler for CronJob selection with cmd/ctrl key
  const handleCronJobClick = (e: React.MouseEvent, cronJob: any) => {
    const cronJobKey = `${cronJob.metadata?.namespace}/${cronJob.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedCronJobs(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(cronJobKey)) {
          newSelection.delete(cronJobKey);
        } else {
          newSelection.add(cronJobKey);
        }
        return newSelection;
      });
    } else if (!selectedCronJobs.has(cronJobKey)) {
      // Clear selection on regular click (unless clicking on already selected cronJob)
      setSelectedCronJobs(new Set());
      handleCronJobDetails(cronJob);
    } else {
      handleCronJobDetails(cronJob);
    }
  };

  const handleViewCronJob = (e: React.MouseEvent, cronJob: any) => {
    e.stopPropagation();
    if (cronJob.metadata?.name && cronJob.metadata?.namespace) {
      navigate(`/dashboard/explore/cronjobs/${cronJob.metadata.namespace}/${cronJob.metadata.name}`);
    }
  };

  const handleDeleteCronJob = (e: React.MouseEvent, cronJob: any) => {
    e.stopPropagation();
    setActiveCronJob(cronJob);
    setSelectedCronJobs(new Set([`${cronJob.metadata?.namespace}/${cronJob.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (cronJob: V1CronJob) => {
    try {
      // Convert cronJob to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        cronJob,
        'CronJob',
        true, // namespaced
        'batch',
        'v1'
      );
      
      // Add to chat context and open drawer
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `CronJob "${cronJob.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding cronJob to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add cronJob to chat context",
        variant: "destructive"
      });
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, cronJob: any) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveCronJob(cronJob);
    setShowContextMenu(true);

    // Multi-select support: if cronJob isn't in selection, make it the only selection
    const cronJobKey = `${cronJob.metadata?.namespace}/${cronJob.metadata?.name}`;
    if (!selectedCronJobs.has(cronJobKey)) {
      setSelectedCronJobs(new Set([cronJobKey]));
    }
  };

  // Close context menu when clicking outside and handle deselection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close context menu when clicking outside
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }

      // Clear selection when clicking outside the table rows
      const target = event.target as Element; // Cast to Element instead of Node

      // Make sure target is an Element before using closest
      if (target instanceof Element) {
        const isTableClick = target.closest('table') !== null;
        const isTableHeadClick = target.closest('thead') !== null;
        const isOutsideTable = !isTableClick || isTableHeadClick;
        const isContextMenuClick = contextMenuRef.current?.contains(event.target as Node) || false;
        const isAlertDialogClick = document.querySelector('.dialog-root')?.contains(event.target as Node) || false;

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedCronJobs.size > 0) {
          setSelectedCronJobs(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedCronJobs]);

  // Handle toggle suspend action
  const handleToggleSuspend = async () => {
    setShowContextMenu(false);

    try {
      if (selectedCronJobs.size === 0 && activeCronJob) {
        // Toggle single active cronJob
        await toggleSuspendCronJob(activeCronJob);
      } else {
        // Toggle all selected cronJobs
        for (const cronJobKey of selectedCronJobs) {
          const [namespace, name] = cronJobKey.split('/');
          const cronJobToToggle = cronJobs.find(cj =>
            cj.metadata?.namespace === namespace && cj.metadata?.name === name
          );

          if (cronJobToToggle) {
            await toggleSuspendCronJob(cronJobToToggle);
          }
        }
      }

      // Refresh cronJob list
      await fetchAllCronJobs();

    } catch (error) {
      console.error('Failed to toggle suspend for cronJob(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to toggle suspend for cronJob(s)');
    }
  };

  // Toggle suspend for a cronJob
  const toggleSuspendCronJob = async (cronJob: any) => {
    if (!currentContext || !cronJob.metadata?.name || !cronJob.metadata?.namespace) return;

    const currentlySuspended = cronJob.spec?.suspend === true;
    const apiVersion = cronJob.apiVersion?.includes('v1beta1') ? 'v1beta1' : 'v1';

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/batch/${apiVersion}/namespaces/${cronJob.metadata.namespace}/cronjobs/${cronJob.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        spec: {
          suspend: !currentlySuspended
        }
      }),
    });
  };

  // Handle trigger manual job run
  const handleTriggerJob = async () => {
    setShowContextMenu(false);

    try {
      if (selectedCronJobs.size === 0 && activeCronJob) {
        // Trigger single active cronJob
        await triggerCronJob(activeCronJob);
      } else {
        // Trigger all selected cronJobs
        for (const cronJobKey of selectedCronJobs) {
          const [namespace, name] = cronJobKey.split('/');
          const cronJobToTrigger = cronJobs.find(cj =>
            cj.metadata?.namespace === namespace && cj.metadata?.name === name
          );

          if (cronJobToTrigger) {
            await triggerCronJob(cronJobToTrigger);
          }
        }
      }

      // Refresh cronJob list
      await fetchAllCronJobs();

    } catch (error) {
      console.error('Failed to trigger cronJob(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to trigger cronJob(s)');
    }
  };

  // Trigger a manual job run
  const triggerCronJob = async (cronJob: V1CronJob) => {
    if (!currentContext || !cronJob.metadata?.name || !cronJob.metadata?.namespace) return;

    // Create a job from the cronJob template
    const jobName = `${cronJob.metadata.name}-manual-${Math.floor(Date.now() / 1000)}`;
    const jobTemplate = cronJob.spec?.jobTemplate;

    if (!jobTemplate) {
      throw new Error('CronJob does not have a job template');
    }


    const job = {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: jobName,
        namespace: cronJob.metadata.namespace,
        creationTimestamp: null,
        annotations: {
          'cronjob.kubernetes.io/instantiate': 'manual',
        },
        ownerReferences: [
          {
            apiVersion: 'batch/v1',
            kind: "CronJob",
            name: cronJob.metadata.name,
            uid: cronJob.metadata.uid,
            controller: true,
            blockOwnerDeletion: true
          }
        ]
      },
      spec: jobTemplate.spec
    };

    // Create the job
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/batch/v1/namespaces/${cronJob.metadata.namespace}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(job),
    });
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteCronJobs = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedCronJobs.size === 0 && activeCronJob) {
        // Delete single active cronJob
        await deleteCronJob(activeCronJob);
      } else {
        // Delete all selected cronJobs
        for (const cronJobKey of selectedCronJobs) {
          const [namespace, name] = cronJobKey.split('/');
          const cronJobToDelete = cronJobs.find(cj =>
            cj.metadata?.namespace === namespace && cj.metadata?.name === name
          );

          if (cronJobToDelete) {
            await deleteCronJob(cronJobToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedCronJobs(new Set());

      // Refresh cronJob list
      await fetchAllCronJobs();

    } catch (error) {
      console.error('Failed to delete cronJob(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete cronJob(s)');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete cronJob function
  const deleteCronJob = async (cronJob: any) => {
    if (!currentContext || !cronJob.metadata?.name || !cronJob.metadata?.namespace) return;

    const apiVersion = cronJob.apiVersion?.includes('v1beta1') ? 'v1beta1' : 'v1';

    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/batch/${apiVersion}/namespaces/${cronJob.metadata.namespace}/cronjobs/${cronJob.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propagationPolicy: "Background"
      }),
    });
  };

  // Is the cronJob suspended?
  const isCronJobSuspended = (cronJob: any): boolean => {
    return cronJob.spec?.suspend === true;
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 180; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    const isSuspended = activeCronJob ? isCronJobSuspended(activeCronJob) : false;

    return createPortal(
      <div
        ref={contextMenuRef}
        className="fixed z-50 min-w-[180px] bg-white dark:bg-[#0B0D13] backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedCronJobs.size > 1
            ? `${selectedCronJobs.size} cronjobs selected`
            : activeCronJob?.metadata?.name || 'CronJob actions'}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleTriggerJob}
        >
          <Clock className="h-4 w-4 mr-2" />
          Trigger Job Now {selectedCronJobs.size > 1 ? `(${selectedCronJobs.size})` : ''}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
          onClick={handleToggleSuspend}
        >
          {isSuspended ? (
            <>
              <Play className="h-4 w-4 mr-2" />
              Resume {selectedCronJobs.size > 1 ? `(${selectedCronJobs.size})` : ''}
            </>
          ) : (
            <>
              <Pause className="h-4 w-4 mr-2" />
              Suspend {selectedCronJobs.size > 1 ? `(${selectedCronJobs.size})` : ''}
            </>
          )}
        </div>

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedCronJobs.size > 1 ? `(${selectedCronJobs.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm CronJob Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedCronJobs.size > 1
                ? `${selectedCronJobs.size} cronjobs`
                : `"${activeCronJob?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Note: This will delete the CronJob resource but may not affect currently running jobs created by it.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteCronJobs}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
  // --- End of Multi-select ---

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  const fetchAllCronJobs = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setCronJobs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const cronJobsData = await listResources(currentContext.name, 'cronjobs', {
          apiGroup: 'batch',
          apiVersion: 'v1'
        });
        setCronJobs(cronJobsData);
        return;
      }

      // Fetch cron jobs for each selected namespace
      const cronJobPromises = selectedNamespaces.map(namespace =>
        listResources(currentContext.name, 'cronjobs', {
          namespace,
          apiGroup: 'batch',
          apiVersion: 'v1'
        })
      );

      const results = await Promise.all(cronJobPromises);

      // Flatten the array of cron job arrays
      const allCronJobs = results.flat();
      setCronJobs(allCronJobs);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch cron jobs:', err);
      // Try v1beta1 API version if v1 fails
      try {
        if (selectedNamespaces.length === 0) {
          const cronJobsData = await listResources(currentContext.name, 'cronjobs', {
            apiGroup: 'batch',
            apiVersion: 'v1beta1'
          });
          setCronJobs(cronJobsData);
          return;
        }

        // Fetch cron jobs for each selected namespace with v1beta1
        const cronJobPromises = selectedNamespaces.map(namespace =>
          listResources(currentContext.name, 'cronjobs', {
            namespace,
            apiGroup: 'batch',
            apiVersion: 'v1beta1'
          })
        );

        const results = await Promise.all(cronJobPromises);
        const allCronJobs = results.flat();
        setCronJobs(allCronJobs);
        setError(null);
      } catch (fallbackErr) {
        console.error('Failed to fetch cron jobs with v1beta1:', fallbackErr);
        setError(err instanceof Error ? err.message : 'Failed to fetch cron jobs');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch cron jobs for all selected namespaces
  useEffect(() => {
    fetchAllCronJobs();
  }, [currentContext, selectedNamespaces]);

  // Filter cron jobs based on search query
  const filteredCronJobs = useMemo(() => {
    if (!searchQuery.trim()) {
      return cronJobs;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return cronJobs.filter(cronJob => {
      const name = cronJob.metadata?.name?.toLowerCase() || '';
      const namespace = cronJob.metadata?.namespace?.toLowerCase() || '';
      const schedule = cronJob.spec?.schedule?.toLowerCase() || '';
      const labels = cronJob.metadata?.labels || {};

      // Check if name, namespace or schedule contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        schedule.includes(lowercaseQuery)
      ) {
        return true;
      }

      // Check if any label contains the query
      return Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );
    });
  }, [cronJobs, searchQuery]);

  // Sort cron jobs based on sort state
  const sortedCronJobs = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredCronJobs;
    }

    return [...filteredCronJobs].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'status': {
          const statusA = getCronJobStatus(a).status;
          const statusB = getCronJobStatus(b).status;
          return statusA.localeCompare(statusB) * sortMultiplier;
        }

        case 'schedule':
          return (a.spec?.schedule || '').localeCompare(b.spec?.schedule || '') * sortMultiplier;

        case 'lastSchedule': {
          const timeA = a.status?.lastScheduleTime ? new Date(a.status.lastScheduleTime).getTime() : 0;
          const timeB = b.status?.lastScheduleTime ? new Date(b.status.lastScheduleTime).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        case 'activeJobs': {
          const activeA = (a.status?.active || []).length;
          const activeB = (b.status?.active || []).length;
          return (activeA - activeB) * sortMultiplier;
        }

        case 'successful': {
          const successTimeA = a.status?.lastSuccessfulTime ? new Date(a.status.lastSuccessfulTime).getTime() : 0;
          const successTimeB = b.status?.lastSuccessfulTime ? new Date(b.status.lastSuccessfulTime).getTime() : 0;
          return (successTimeA - successTimeB) * sortMultiplier;
        }

        case 'age': {
          const timeA = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
          const timeB = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredCronJobs, sort.field, sort.direction]);

  const handleCronJobDetails = (cronJob: any) => {
    if (cronJob.metadata?.name && cronJob.metadata?.namespace) {
      navigate(`/dashboard/explore/cronjobs/${cronJob.metadata.namespace}/${cronJob.metadata.name}`);
    }
  };

  // Handle column sort click
  const handleSort = (field: SortField) => {
    setSort(prevSort => {
      // If clicking the same field
      if (prevSort.field === field) {
        // Toggle direction: asc -> desc -> null -> asc
        if (prevSort.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prevSort.direction === 'desc') {
          return { field: null, direction: null };
        } else {
          return { field, direction: 'asc' };
        }
      }
      // If clicking a new field, default to ascending
      return { field, direction: 'asc' };
    });
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sort.field !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-10" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  // Format the schedule for human readability
  const formatSchedule = (schedule: string): string => {
    return schedule;
  };

  // Get status of the cron job (active, suspended, etc.)
  const getCronJobStatus = (cronJob: any): { status: string, colorClass: string } => {
    const suspended = cronJob.spec?.suspend === true;
    const active = (cronJob.status?.active || []).length > 0;
    const lastScheduleTime = cronJob.status?.lastScheduleTime;
    const lastSuccessfulTime = cronJob.status?.lastSuccessfulTime;

    if (suspended) {
      return {
        status: 'Suspended',
        colorClass: 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
      };
    }

    if (active) {
      return {
        status: 'Active',
        colorClass: 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      };
    }

    if (lastSuccessfulTime) {
      return {
        status: 'Scheduled',
        colorClass: 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      };
    }

    if (lastScheduleTime) {
      return {
        status: 'LastScheduled',
        colorClass: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      };
    }

    return {
      status: 'Waiting',
      colorClass: 'bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
    };
  };

  // Get the last schedule time in a readable format
  const formatLastSchedule = (cronJob: any): string => {
    const lastScheduleTime = cronJob.status?.lastScheduleTime;
    if (!lastScheduleTime) {
      return 'Never';
    }

    return calculateAge(lastScheduleTime);
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
      <ErrorComponent message={error} />
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
      <div className='flex items-center justify-between md:flex-row gap-4 md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>CronJobs</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or schedule..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-96">
          <div className="text-sm font-medium mb-2">Namespaces</div>
          <NamespaceSelector />
        </div>
      </div>

      {/* No results message */}
      {sortedCronJobs.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No cron jobs matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No cron jobs found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* CronJobs table */}
      {sortedCronJobs.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('name')}
                  >
                    Name {renderSortIndicator('name')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('namespace')}
                  >
                    Namespace {renderSortIndicator('namespace')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('status')}
                  >
                    Status {renderSortIndicator('status')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('schedule')}
                  >
                    Schedule {renderSortIndicator('schedule')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('lastSchedule')}
                  >
                    Last Schedule {renderSortIndicator('lastSchedule')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('activeJobs')}
                  >
                    Active Jobs {renderSortIndicator('activeJobs')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('successful')}
                  >
                    Successful {renderSortIndicator('successful')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCronJobs.map((cronJob) => {
                  const status = getCronJobStatus(cronJob);
                  const activeJobs = cronJob.status?.active?.length || 0;
                  const lastSuccessfulTime = cronJob.status?.lastSuccessfulTime ? calculateAge(cronJob.status?.lastSuccessfulTime?.toString()) : '-';

                  return (
                    <TableRow
                      key={`${cronJob.metadata?.namespace}-${cronJob.metadata?.name}`}
                      className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedCronJobs.has(`${cronJob.metadata?.namespace}/${cronJob.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                        }`}
                      onClick={(e) => handleCronJobClick(e, cronJob)}
                      onContextMenu={(e) => handleContextMenu(e, cronJob)}
                    >
                      <TableCell className="font-medium">
                        <div className="hover:text-blue-500 hover:underline">
                          {cronJob.metadata?.name}
                        </div>
                      </TableCell>
                      <TableCell>{cronJob.metadata?.namespace}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${status.colorClass}`}>
                          {status.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300">
                          {formatSchedule(cronJob.spec?.schedule || '')}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {formatLastSchedule(cronJob)}
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={activeJobs > 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}>
                          {activeJobs}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {lastSuccessfulTime}
                      </TableCell>
                      <TableCell className="text-center">
                        {calculateAge(cronJob.metadata?.creationTimestamp?.toString())}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-sm text-gray-800 dark:text-gray-300 '>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              handleAskAI(cronJob);
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Ask AI
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleViewCronJob(e, cronJob)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                              onClick={(e) => handleDeleteCronJob(e, cronJob)}
                            >
                              <Trash className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default CronJobs;