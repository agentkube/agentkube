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
import { RefreshCw, Trash2, Play, XCircle, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Eye, Trash } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { OPERATOR_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { resourceToEnrichedSearchResult } from '@/utils/resource-to-enriched.utils';
import { toast } from '@/hooks/use-toast';


// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'status' | 'completions' | 'duration' | 'parallelism' | 'owner' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Jobs: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  // --- State for Multi-select ---
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeJob, setActiveJob] = useState<any | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const { addResourceContext } = useDrawer();

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

  // Add click handler for job selection with cmd/ctrl key
  const handleJobClick = (e: React.MouseEvent, job: any) => {
    const jobKey = `${job.metadata?.namespace}/${job.metadata?.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedJobs(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(jobKey)) {
          newSelection.delete(jobKey);
        } else {
          newSelection.add(jobKey);
        }
        return newSelection;
      });
    } else if (!selectedJobs.has(jobKey)) {
      // Clear selection on regular click (unless clicking on already selected job)
      setSelectedJobs(new Set());
      handleJobDetails(job);
    } else {
      handleJobDetails(job);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, job: any) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveJob(job);
    setShowContextMenu(true);

    // Multi-select support: if job isn't in selection, make it the only selection
    const jobKey = `${job.metadata?.namespace}/${job.metadata?.name}`;
    if (!selectedJobs.has(jobKey)) {
      setSelectedJobs(new Set([jobKey]));
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

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedJobs.size > 0) {
          setSelectedJobs(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedJobs]);

  // Handle creating a new job from this job (re-run)
  const handleRerunJob = async () => {
    setShowContextMenu(false);

    try {
      if (selectedJobs.size === 0 && activeJob) {
        // Rerun single active job
        await rerunJob(activeJob);
      } else {
        // Rerun all selected jobs
        for (const jobKey of selectedJobs) {
          const [namespace, name] = jobKey.split('/');
          const jobToRerun = jobs.find(j =>
            j.metadata?.namespace === namespace && j.metadata?.name === name
          );

          if (jobToRerun) {
            await rerunJob(jobToRerun);
          }
        }
      }

      // Refresh job list
      await fetchAllJobs();

    } catch (error) {
      console.error('Failed to rerun job(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to rerun job(s)');
    }
  };

  // Rerun job by creating a new job with the same spec
  const rerunJob = async (job: any) => {
    if (!currentContext || !job.metadata?.name || !job.metadata?.namespace) return;

    try {
      // Create a new job object based on the existing one
      const newJob = {
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: {
          name: `${job.metadata.name}-rerun-${Math.floor(Date.now() / 1000)}`,
          namespace: job.metadata.namespace,
          labels: job.metadata.labels || {}
        },
        spec: { ...job.spec }
      };

      // Remove fields that shouldn't be copied
      if (newJob.spec.selector && newJob.spec.selector.matchLabels) {
        delete newJob.spec.selector.matchLabels;
      }
      if (newJob.spec.template && newJob.spec.template.metadata && newJob.spec.template.metadata.labels) {
        delete newJob.spec.template.metadata.labels;
      }

      // Create the new job
      await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/batch/v1/namespaces/${job.metadata.namespace}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newJob),
      });
    } catch (error) {
      console.error('Failed to rerun job:', error);
      throw error;
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteJobs = async () => {
    setShowDeleteDialog(false);
    setDeleteLoading(true);

    try {
      if (selectedJobs.size === 0 && activeJob) {
        // Delete single active job
        await deleteJob(activeJob);
      } else {
        // Delete all selected jobs
        for (const jobKey of selectedJobs) {
          const [namespace, name] = jobKey.split('/');
          const jobToDelete = jobs.find(j =>
            j.metadata?.namespace === namespace && j.metadata?.name === name
          );

          if (jobToDelete) {
            await deleteJob(jobToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedJobs(new Set());

      // Refresh job list
      await fetchAllJobs();

    } catch (error) {
      console.error('Failed to delete job(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete job(s)');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Delete job function
  const deleteJob = async (job: any) => {
    if (!currentContext || !job.metadata?.name || !job.metadata?.namespace) return;

    // The propagationPolicy: "Background" ensures pods will be deleted
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/batch/v1/namespaces/${job.metadata.namespace}/jobs/${job.metadata.name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        propagationPolicy: "Background"
      }),
    });
  };

  // Handle terminate action
  const handleTerminateJob = async () => {
    setShowContextMenu(false);

    try {
      if (selectedJobs.size === 0 && activeJob) {
        // Terminate single active job
        await terminateJob(activeJob);
      } else {
        // Terminate all selected jobs
        for (const jobKey of selectedJobs) {
          const [namespace, name] = jobKey.split('/');
          const jobToTerminate = jobs.find(j =>
            j.metadata?.namespace === namespace && j.metadata?.name === name
          );

          if (jobToTerminate) {
            await terminateJob(jobToTerminate);
          }
        }
      }

      // Refresh job list
      await fetchAllJobs();

    } catch (error) {
      console.error('Failed to terminate job(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to terminate job(s)');
    }
  };

  // Terminate job (by setting completions and parallelism to 0)
  const terminateJob = async (job: any) => {
    if (!currentContext || !job.metadata?.name || !job.metadata?.namespace) return;

    // Set completions and parallelism to 0 to stop running pods
    await fetch(`${OPERATOR_URL}/clusters/${currentContext.name}/apis/batch/v1/namespaces/${job.metadata.namespace}/jobs/${job.metadata.name}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/strategic-merge-patch+json',
      },
      body: JSON.stringify({
        spec: {
          parallelism: 0
        }
      }),
    });
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 180; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    const jobStatus = activeJob ? getJobStatus(activeJob) : { status: '' };
    const isRunning = jobStatus.status === 'Running';
    const isComplete = jobStatus.status === 'Completed';
    const isFailed = jobStatus.status === 'Failed';

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
          {selectedJobs.size > 1
            ? `${selectedJobs.size} jobs selected`
            : activeJob?.metadata?.name || 'Job actions'}
        </div>

        <div
          className={`px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center ${isRunning ? 'text-gray-400 dark:text-gray-600 pointer-events-none' : ''}`}
          onClick={!isRunning ? handleRerunJob : undefined}
        >
          <Play className="h-4 w-4 mr-2" />
          Re-run {selectedJobs.size > 1 ? `(${selectedJobs.size})` : ''}
        </div>

        {isRunning && (
          <div
            className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
            onClick={handleTerminateJob}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Terminate {selectedJobs.size > 1 ? `(${selectedJobs.size})` : ''}
          </div>
        )}

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedJobs.size > 1 ? `(${selectedJobs.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  const handleViewJob = (e: React.MouseEvent, job: any) => {
    e.stopPropagation();
    if (job.metadata?.name && job.metadata?.namespace) {
      navigate(`/dashboard/explore/jobs/${job.metadata.namespace}/${job.metadata.name}`);
    }
  };

  const handleDeleteJob = (e: React.MouseEvent, job: any) => {
    e.stopPropagation();
    setActiveJob(job);
    setSelectedJobs(new Set([`${job.metadata?.namespace}/${job.metadata?.name}`]));
    setShowDeleteDialog(true);
  };

  const handleAskAI = (job: any) => {
    try {
      // Convert job to EnrichedSearchResult format
      const resourceContext = resourceToEnrichedSearchResult(
        job,
        'Job',
        true, // namespaced
        'batch',
        'v1'
      );
      
      // Add to chat context and open drawer
      addResourceContext(resourceContext);
      
      // Show success toast
      toast({
        title: "Added to Chat",
        description: `Job "${job.metadata?.name}" has been added to chat context`
      });
    } catch (error) {
      console.error('Error adding job to chat:', error);
      toast({
        title: "Error",
        description: "Failed to add job to chat context",
        variant: "destructive"
      });
    }
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Job Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedJobs.size > 1
                ? `${selectedJobs.size} jobs`
                : `"${activeJob?.metadata?.name}"`}?
              This action cannot be undone and will remove the job and all its pods.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteJobs}
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
  // --- Multi-select ---


  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  const fetchAllJobs = async () => {
    if (!currentContext || selectedNamespaces.length === 0) {
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // If no namespaces are selected, fetch from all namespaces
      if (selectedNamespaces.length === 0) {
        const jobsData = await listResources(currentContext.name, 'jobs', {
          apiGroup: 'batch',
          apiVersion: 'v1'
        });
        setJobs(jobsData);
        return;
      }

      // Fetch jobs for each selected namespace
      const jobPromises = selectedNamespaces.map(namespace =>
        listResources(currentContext.name, 'jobs', {
          namespace,
          apiGroup: 'batch',
          apiVersion: 'v1'
        })
      );

      const results = await Promise.all(jobPromises);

      // Flatten the array of job arrays
      const allJobs = results.flat();
      setJobs(allJobs);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch jobs');
    } finally {
      setLoading(false);
    }
  };
  // Fetch jobs for all selected namespaces
  useEffect(() => {


    fetchAllJobs();
  }, [currentContext, selectedNamespaces]);

  // Filter jobs based on search query
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) {
      return jobs;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return jobs.filter(job => {
      const name = job.metadata?.name?.toLowerCase() || '';
      const namespace = job.metadata?.namespace?.toLowerCase() || '';
      const owner = job.metadata?.ownerReferences?.[0]?.name?.toLowerCase() || '';
      const labels = job.metadata?.labels || {};

      // Check if name, namespace or owner contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        owner.includes(lowercaseQuery)
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
  }, [jobs, searchQuery]);

  // Sort jobs based on sort state
  const sortedJobs = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredJobs;
    }

    return [...filteredJobs].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'status': {
          const statusA = getJobStatus(a).status;
          const statusB = getJobStatus(b).status;
          return statusA.localeCompare(statusB) * sortMultiplier;
        }

        case 'completions': {
          const succeededA = a.status?.succeeded || 0;
          const succeededB = b.status?.succeeded || 0;
          const totalA = a.spec?.completions || 1;
          const totalB = b.spec?.completions || 1;

          // Calculate completion percentage for more accurate sorting
          const percentA = totalA > 0 ? succeededA / totalA : 0;
          const percentB = totalB > 0 ? succeededB / totalB : 0;

          return (percentA - percentB) * sortMultiplier;
        }

        case 'duration': {
          const durationA = getDurationMs(a);
          const durationB = getDurationMs(b);
          return (durationA - durationB) * sortMultiplier;
        }

        case 'parallelism': {
          const parallelismA = a.spec?.parallelism || 1;
          const parallelismB = b.spec?.parallelism || 1;
          return (parallelismA - parallelismB) * sortMultiplier;
        }

        case 'owner': {
          const ownerA = getOwnerReference(a);
          const ownerB = getOwnerReference(b);
          const ownerNameA = ownerA ? ownerA.name : '';
          const ownerNameB = ownerB ? ownerB.name : '';
          return ownerNameA.localeCompare(ownerNameB) * sortMultiplier;
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
  }, [filteredJobs, sort.field, sort.direction]);

  const handleJobDetails = (job: any) => {
    if (job.metadata?.name && job.metadata?.namespace) {
      navigate(`/dashboard/explore/jobs/${job.metadata.namespace}/${job.metadata.name}`);
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

  // Get owner reference (like CronJob)
  const getOwnerReference = (job: any): { name: string, kind: string } | null => {
    const ownerRefs = job.metadata?.ownerReferences || [];
    if (ownerRefs.length > 0) {
      return {
        name: ownerRefs[0].name,
        kind: ownerRefs[0].kind
      };
    }
    return null;
  };

  // Determine job completion status
  const getJobStatus = (job: any): { status: string, colorClass: string } => {
    const succeeded = job.status?.succeeded || 0;
    const failed = job.status?.failed || 0;
    const active = job.status?.active || 0;
    const completions = job.spec?.completions || 1;

    if (succeeded >= completions) {
      return {
        status: 'Completed',
        colorClass: 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      };
    }

    if (failed > 0) {
      return {
        status: 'Failed',
        colorClass: 'bg-red-200 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      };
    }

    if (active > 0) {
      return {
        status: 'Running',
        colorClass: 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      };
    }

    return {
      status: 'Pending',
      colorClass: 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    };
  };

  // Get duration in milliseconds for sorting
  const getDurationMs = (job: any): number => {
    const startTime = job.status?.startTime;
    const completionTime = job.status?.completionTime;

    if (!startTime) {
      return 0;
    }

    const start = new Date(startTime);
    const end = completionTime ? new Date(completionTime) : new Date();

    return end.getTime() - start.getTime();
  };

  // Calculate duration from creation time to completion time
  const calculateDuration = (job: any): string => {
    const startTime = job.status?.startTime;
    const completionTime = job.status?.completionTime;

    if (!startTime) {
      return '-';
    }

    const start = new Date(startTime);
    const end = completionTime ? new Date(completionTime) : new Date();

    const durationMs = end.getTime() - start.getTime();
    const durationSec = Math.floor(durationMs / 1000);

    if (durationSec < 60) {
      return `${durationSec}s`;
    }

    const durationMin = Math.floor(durationSec / 60);
    if (durationMin < 60) {
      return `${durationMin}m ${durationSec % 60}s`;
    }

    const durationHour = Math.floor(durationMin / 60);
    return `${durationHour}h ${durationMin % 60}m`;
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
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Jobs</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, or owner..."
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
      {sortedJobs.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No jobs matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No jobs found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Jobs table */}
      {sortedJobs.length > 0 && (
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
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('completions')}
                  >
                    Completions {renderSortIndicator('completions')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('duration')}
                  >
                    Duration {renderSortIndicator('duration')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('parallelism')}
                  >
                    Parallelism {renderSortIndicator('parallelism')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('owner')}
                  >
                    Owner {renderSortIndicator('owner')}
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
                {sortedJobs.map((job) => {
                  const jobStatus = getJobStatus(job);
                  const owner = getOwnerReference(job);
                  return (
                    <TableRow
                      key={`${job.metadata?.namespace}-${job.metadata?.name}`}
                      className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${selectedJobs.has(`${job.metadata?.namespace}/${job.metadata?.name}`) ? 'bg-blue-50 dark:bg-gray-800/30' : ''
                        }`}
                      onClick={(e) => handleJobClick(e, job)}
                      onContextMenu={(e) => handleContextMenu(e, job)}
                    >
                      <TableCell className="font-medium">
                        <div className="hover:text-blue-500 hover:underline">
                          {job.metadata?.name}
                        </div>
                      </TableCell>
                      <TableCell>{job.metadata?.namespace}</TableCell>
                      <TableCell className="text-center">
                        <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${jobStatus.colorClass}`}>
                          {jobStatus.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        {`${job.status?.succeeded || 0}/${job.spec?.completions || 1}`}
                      </TableCell>
                      <TableCell className="text-center">
                        {calculateDuration(job)}
                      </TableCell>
                      <TableCell className="text-center">
                        {job.spec?.parallelism || 1}
                      </TableCell>
                      <TableCell>
                        {owner ? (
                          <div className="flex items-center gap-1">
                            <span className="px-2 py-1 rounded-[0.3rem] text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
                              {owner.kind}
                            </span>
                            <span className="hover:text-blue-500 hover:underline">
                              {owner.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-gray-500 dark:text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {calculateAge(job.metadata?.creationTimestamp?.toString())}
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
                              handleAskAI(job);
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Ask AI
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handleViewJob(e, job)} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500 dark:text-red-400 focus:text-red-500 dark:focus:text-red-400 hover:text-red-700 dark:hover:text-red-500"
                              onClick={(e) => handleDeleteJob(e, job)}
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

export default Jobs;