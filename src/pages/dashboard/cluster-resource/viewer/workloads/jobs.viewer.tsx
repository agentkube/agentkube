import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { V1Job, CoreV1Event } from '@kubernetes/client-node';
import {
  deleteResource,
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useReconMode } from '@/contexts/useRecon';
import { toast } from '@/hooks/use-toast';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Box, Check, X, PlayCircle, Trash, Crosshair } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

// Custom component imports
import PropertiesViewer from '../components/properties.viewer';
import EventsViewer from '../components/event.viewer';
import JobPods from '../components/jobpods.viewer';
import ResourceViewerYamlTab from '@/components/custom/editor/resource-viewer-tabs.component';
import { DeletionDialog, ResourceCanvas } from '@/components/custom';

// Define interface for job data (extending V1Job with events)
interface JobData extends V1Job {
  events?: CoreV1Event[];
}

const JobViewer: React.FC = () => {
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext, fullWidth } = useCluster();
  const { jobName, namespace } = useParams<{ jobName: string; namespace: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || 'overview';
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { isReconMode } = useReconMode();
  // Get attack path mode from URL params
  const attackPathParam = searchParams.get('attackPath');
  const [attackPathMode, setAttackPathMode] = useState(attackPathParam === 'true');

  // Sync attack path mode with URL parameter
  useEffect(() => {
    const urlAttackPath = searchParams.get('attackPath') === 'true';
    if (urlAttackPath !== attackPathMode) {
      setAttackPathMode(urlAttackPath);
    }
  }, [searchParams, attackPathMode]);

  // Fetch events for the job
  const fetchEvents = async () => {
    if (!currentContext || !namespace || !jobName) return;

    try {
      // Fetch events specific to this job using fieldSelector
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        {
          namespace,
          fieldSelector: `involvedObject.name=${jobName},involvedObject.kind=Job`
        }
      );

      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch job data and events
  useEffect(() => {
    const fetchJobData = async () => {
      if (!currentContext || !jobName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get job details
        const data = await getResource<'jobs'>(
          currentContext.name,
          'jobs',
          jobName,
          namespace,
          'batch' // API group for jobs
        );

        setJobData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching job:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch job data');
      } finally {
        setLoading(false);
      }
    };

    fetchJobData();
  }, [currentContext, namespace, jobName]);

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
    if (!jobData || !currentContext) {
      setShowDeleteDialog(false);
      return;
    }

    try {
      setDeleteLoading(true);

      await deleteResource(
        currentContext.name,
        'jobs',
        jobData.metadata?.name as string,
        {
          namespace: jobData.metadata?.namespace,
          apiGroup: 'batch'
        }
      );

      // Navigate back to the jobs list
      navigate('/dashboard/explore/jobs');
    } catch (err) {
      console.error('Failed to delete job:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  };
  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && jobName && namespace) {
      Promise.all([
        getResource<'jobs'>(
          currentContext.name,
          'jobs',
          jobName,
          namespace,
          'batch'
        ),
        fetchEvents()
      ]).then(([data]) => {
        setJobData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Get job status
  const getJobStatus = () => {
    if (!jobData || !jobData.status) {
      return { status: 'Unknown', isComplete: false, isFailed: false };
    }

    const completions = jobData.spec?.completions || 1;
    const succeeded = jobData.status.succeeded || 0;
    const failed = jobData.status.failed || 0;
    const active = jobData.status.active || 0;

    // Check if job completed successfully
    if (succeeded >= completions) {
      return { status: 'Completed', isComplete: true, isFailed: false };
    }

    // Check if job failed
    if (failed > 0 && jobData.spec?.backoffLimit !== undefined && failed >= jobData.spec.backoffLimit) {
      return { status: 'Failed', isComplete: false, isFailed: true };
    }

    // Active jobs
    if (active > 0) {
      return { status: 'Running', isComplete: false, isFailed: false };
    }

    // Pending jobs or other states
    return { status: 'Pending', isComplete: false, isFailed: false };
  };

  // Calculate job duration
  const getJobDuration = () => {
    if (!jobData || !jobData.status || !jobData.status.startTime) {
      return 'N/A';
    }

    const startTime = new Date(jobData.status.startTime);
    let endTime;

    if (jobData.status.completionTime) {
      endTime = new Date(jobData.status.completionTime);
    } else {
      endTime = new Date(); // If job is still running, use current time
    }

    const durationMs = endTime.getTime() - startTime.getTime();

    // Format duration
    if (durationMs < 1000) {
      return `${durationMs}ms`;
    } else if (durationMs < 60000) {
      return `${Math.round(durationMs / 1000)}s`;
    } else if (durationMs < 3600000) {
      return `${Math.round(durationMs / 60000)}m ${Math.round((durationMs % 60000) / 1000)}s`;
    } else {
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.round((durationMs % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }
  };

  // Calculate job age
  const getJobAge = () => {
    if (!jobData || !jobData.metadata || !jobData.metadata.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(jobData.metadata.creationTimestamp);
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

  // Format date time for display
  const formatDateTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Status alert component based on job status
  const JobStatusAlert = () => {
    const { status, isComplete, isFailed } = getJobStatus();

    if (isComplete) {
      return (
        <Alert className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle>Job Completed Successfully</AlertTitle>
          <AlertDescription>
            This job has completed all of its tasks successfully.
            {jobData?.status?.completionTime && (
              <div className="mt-1">
                Completion Time: {jobData.status.completionTime.toLocaleString()}
              </div>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    if (isFailed) {
      return (
        <Alert className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" variant="destructive">
          <X className="h-4 w-4" />
          <AlertTitle>Job Failed</AlertTitle>
          <AlertDescription>
            This job has failed after reaching its backoff limit.
            {jobData?.status?.conditions?.map((condition, i) => (
              <div key={i} className="mt-1">
                {condition.type}: {condition.message}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      );
    }

    if (status === 'Running') {
      return (
        <Alert className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <PlayCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <AlertTitle>Job is Running</AlertTitle>
          <AlertDescription>
            This job is currently executing its tasks.
            {jobData?.status?.startTime && (
              <div className="mt-1">
                Start Time: {formatDateTime(jobData.status.startTime?.toString())}
              </div>
            )}
          </AlertDescription>
        </Alert>
      );
    }

    if (status === 'Pending') {
      return (
        <Alert className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle>Job is Pending</AlertTitle>
          <AlertDescription>
            This job is waiting to be scheduled or its pods are being created.
          </AlertDescription>
        </Alert>
      );
    }

    return null;
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
          <AlertTitle>Error loading job data</AlertTitle>
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

  // If no job data
  if (!jobData || !jobData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No job data available</AlertTitle>
          <AlertDescription>
            The requested job was not found or could not be retrieved.
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

  // Calculate job status and metrics
  const { status } = getJobStatus();
  const completions = jobData.spec?.completions || 1;
  const succeeded = jobData.status?.succeeded || 0;
  const failed = jobData.status?.failed || 0;
  const active = jobData.status?.active || 0;

  // Set status color
  let statusColor;
  switch (status) {
    case 'Completed':
      statusColor = 'text-green-600 dark:text-green-400';
      break;
    case 'Failed':
      statusColor = 'text-red-600 dark:text-red-400';
      break;
    case 'Running':
      statusColor = 'text-blue-600 dark:text-blue-400';
      break;
    default:
      statusColor = 'text-yellow-600 dark:text-yellow-400';
  }

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
              <BreadcrumbLink href="/dashboard/explore/jobs">Jobs</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/jobs?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{jobData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{jobData.metadata.name}</h1>
                <Badge
                  className={`${status === 'Completed'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : status === 'Failed'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      : status === 'Running'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${jobData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{jobData.metadata.namespace}</span>
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

        {/* Status alert if needed */}
        <JobStatusAlert />

        {jobData && (
          <DeletionDialog
            isOpen={showDeleteDialog}
            onClose={() => setShowDeleteDialog(false)}
            onConfirm={confirmResourceDeletion}
            title="Delete Job"
            description={`Are you sure you want to delete the job "${jobData.metadata.name}" in namespace "${jobData.metadata.namespace}"? This action cannot be undone.`}
            resourceName={jobData.metadata.name as string}
            resourceType="Job"
            isLoading={deleteLoading}
          />
        )}

        {/* Main content tabs */}
        <Tabs defaultValue={defaultTab}
          onValueChange={(value) => {
            setSearchParams(params => {
              params.set('tab', value);
              return params;
            });
          }}
          className="space-y-6">
          <div className='flex justify-between items-center'>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="yaml">YAML</TabsTrigger>
              <TabsTrigger value="canvas">Canvas</TabsTrigger>
              <TabsTrigger value="events">Events</TabsTrigger>
              <TabsTrigger value="pods">Pods</TabsTrigger>
            </TabsList>

            {defaultTab === 'canvas' && (
              <Button
                variant={attackPathMode ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  const newAttackPathMode = !attackPathMode;
                  setAttackPathMode(newAttackPathMode);
                  setSearchParams(params => {
                    if (newAttackPathMode) {
                      params.set('attackPath', 'true');
                    } else {
                      params.delete('attackPath');
                    }
                    return params;
                  });
                }}
                className={`ml-2 h-9 ${attackPathMode ? 'bg-orange-500/20 dark:bg-orange-700/20 text-orange-500 dark:text-orange-400 border-none' : ''}`}
                title={attackPathMode ? "Disable Attack Path Analysis" : "Enable Attack Path Analysis"}
              >
                <Crosshair className="h-4 w-4 mr-1.5" />
                Attack Path
              </Button>
            )}
          </div>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* Job Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Succeeded</h3>
                </div>
                <div className="text-4xl font-light">
                  {succeeded}/{completions}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Succeeded/Completions
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <X className="h-4 w-4 text-red-500" />
                  <h3 className="text-sm font-medium">Failed</h3>
                </div>
                <div className="text-4xl font-light">
                  {failed}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Backoff Limit: {jobData.spec?.backoffLimit || 6}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <PlayCircle className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Active</h3>
                </div>
                <div className="text-4xl font-light">
                  {active}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Currently Running
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Duration</h3>
                </div>
                <div className="text-4xl font-light">
                  {getJobDuration()}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Age: {getJobAge()}
                </div>
              </div>
            </div>

            {/* Job Properties */}
            <PropertiesViewer
              metadata={jobData.metadata}
              kind="Job"
              status={status}
              additionalProperties={[
                {
                  label: "Completions",
                  value: `${succeeded}/${completions}`
                },
                {
                  label: "Parallelism",
                  value: jobData.spec?.parallelism || 1
                },
                {
                  label: "Completion Mode",
                  value: jobData.spec?.completionMode || "NonIndexed"
                },
                {
                  label: "Backoff Limit",
                  value: jobData.spec?.backoffLimit || 6
                },
                {
                  label: "Active Deadline",
                  value: jobData.spec?.activeDeadlineSeconds ?
                    `${jobData.spec.activeDeadlineSeconds}s` :
                    'No deadline'
                },
                {
                  label: "TTL After Completion",
                  value: jobData.spec?.ttlSecondsAfterFinished ?
                    `${jobData.spec.ttlSecondsAfterFinished}s` :
                    'Not set'
                }
              ]}
            />

            {/* Job Timing */}
            <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Job Timing</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Created</div>
                  <div className="font-medium">{formatDateTime(jobData.metadata.creationTimestamp?.toString())}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Started</div>
                  <div className="font-medium">{formatDateTime(jobData.status?.startTime?.toString())}</div>
                </div>
                {jobData.status?.completionTime && (
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Completed</div>
                    <div className="font-medium">{formatDateTime(jobData.status.completionTime?.toString())}</div>
                  </div>
                )}
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Duration</div>
                  <div className="font-medium">{getJobDuration()}</div>
                </div>
              </div>
            </div>

            {/* Job Conditions */}
            {jobData.status?.conditions && jobData.status.conditions.length > 0 && (
              <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4 mb-6">
                <h2 className="text-lg font-medium mb-4">Conditions</h2>
                <div className="space-y-3">
                  {jobData.status.conditions.map((condition, index) => (
                    <div key={index} className="p-3 rounded-lg border border-gray-200 dark:border-accent/50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium">{condition.type}</span>
                        <span className={condition.status === 'True'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'}>
                          {condition.status}
                        </span>
                      </div>
                      {condition.reason && (
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Reason: </span>
                          {condition.reason}
                        </div>
                      )}
                      {condition.message && (
                        <div className="text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Message: </span>
                          {condition.message}
                        </div>
                      )}
                      {condition.lastTransitionTime && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          Last transition: {formatDateTime(condition.lastTransitionTime?.toString())}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pod Template */}
            <div className="rounded-lg border border-gray-200 dark:border-accent/50 bg-white dark:bg-transparent p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Pod Template</h2>
              <div className="space-y-4">
                {/* Template Labels */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Labels</h3>
                  <div className="flex flex-wrap gap-1">
                    {jobData.spec?.template?.metadata?.labels ? (
                      Object.entries(jobData.spec.template.metadata.labels).map(([key, value]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className="text-xs font-normal px-2 py-1 bg-gray-100 dark:bg-gray-800/30 border border-gray-200 dark:border-accent/50"
                        >
                          {key}: {value}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-gray-500 dark:text-gray-400">No labels</span>
                    )}
                  </div>
                </div>

                {/* Template Containers */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Containers</h3>
                  <div className="space-y-2">
                    {jobData.spec?.template?.spec?.containers.map((container, index) => (
                      <div
                        key={container.name}
                        className="p-3 rounded-lg border border-gray-200 dark:border-accent/50"
                      >
                        <div className="font-medium mb-1">{container.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Image: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{container.image}</code>
                        </div>

                        {/* Command & Args */}
                        {container.command && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Command:</div>
                            <code className="bg-gray-100 dark:bg-gray-800/40 px-2 py-1 rounded block text-xs overflow-auto">
                              {container.command.join(' ')}
                            </code>
                          </div>
                        )}

                        {container.args && container.args.length > 0 && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Args:</div>
                            <code className="bg-gray-100 dark:bg-gray-800/40 px-2 py-1 rounded block text-xs overflow-auto">
                              {container.args.join(' ')}
                            </code>
                          </div>
                        )}

                        {/* Resources */}
                        {container.resources && (Object.keys(container.resources).length > 0) && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Resources:</div>
                            <div className="grid grid-cols-2 gap-2">
                              {container.resources.requests && (
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Requests:</span>{' '}
                                  {Object.entries(container.resources.requests)
                                    .map(([key, value]) => `${key}: ${value}`)
                                    .join(', ')}
                                </div>
                              )}

                              {container.resources.limits && (
                                <div>
                                  <span className="text-gray-500 dark:text-gray-400">Limits:</span>{' '}
                                  {Object.entries(container.resources.limits)
                                    .map(([key, value]) => `${key}: ${value}`)
                                    .join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Restart Policy */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Restart Policy</h3>
                  <Badge variant="outline">
                    {jobData.spec?.template?.spec?.restartPolicy || 'Never'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Job Events */}
            <EventsViewer
              events={events}
              resourceName={jobData.metadata.name}
              resourceKind="Job"
              namespace={jobData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={jobData}
              namespace={jobData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="canvas" className="space-y-6">
            <div className="h-[calc(100vh-300px)] min-h-[500px] rounded-lg border border-gray-200 dark:border-accent/50 overflow-hidden">
              {jobData && (
                <ResourceCanvas
                  resourceDetails={{
                    namespace: jobData.metadata?.namespace || '',
                    group: 'batch',
                    version: 'v1',
                    resourceType: 'jobs',
                    resourceName: jobData.metadata?.name || '',
                  }}
                  attackPath={attackPathMode}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={jobData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="pods" className="space-y-6">
            {jobName && namespace && currentContext && (
              <JobPods
                jobName={jobName}
                namespace={namespace}
                clusterName={currentContext.name}
                job={jobData}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default JobViewer;