import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { V1CronJob, V1Job, CoreV1Event } from '@kubernetes/client-node';
import {
  getResource,
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, Clock, ArrowLeft, RefreshCw, Calendar, PlayCircle, History, Check } from "lucide-react";
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

// Define interface for cronjob data (extending V1CronJob with events)
interface CronJobData extends V1CronJob {
  events?: CoreV1Event[];
  jobs?: V1Job[];
}

const CronJobViewer: React.FC = () => {
  const [cronJobData, setCronJobData] = useState<CronJobData | null>(null);
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [jobs, setJobs] = useState<V1Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { cronJobName, namespace } = useParams<{ cronJobName: string; namespace: string }>();
  const navigate = useNavigate();

  // Fetch events for the cronjob
  const fetchEvents = async () => {
    if (!currentContext || !namespace) return;

    try {
      // Fetch all events in the namespace
      const eventData = await listResources<'events'>(
        currentContext.name,
        'events',
        { namespace }
      );

      setEvents(eventData);
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  };

  // Fetch child jobs for the cronjob
  const fetchJobs = async () => {
    if (!currentContext || !namespace || !cronJobData) return;

    try {
      // Fetch all jobs in the namespace
      const jobsData = await listResources<'jobs'>(
        currentContext.name,
        'jobs',
        { 
          namespace,
          apiGroup: 'batch'
        }
      );

      // Filter jobs to only include those owned by this cronjob
      const childJobs = jobsData.filter(job => {
        return job.metadata?.ownerReferences?.some(
          (ref: { kind: string; name: string }) => ref.kind === 'CronJob' && ref.name === cronJobName
        );
      });

      // Sort by creation timestamp, newest first
      childJobs.sort((a, b) => {
        const dateA = new Date(a.metadata?.creationTimestamp || '');
        const dateB = new Date(b.metadata?.creationTimestamp || '');
        return dateB.getTime() - dateA.getTime();
      });

      setJobs(childJobs);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  };

  // Fetch cronjob data, events, and jobs
  useEffect(() => {
    const fetchCronJobData = async () => {
      if (!currentContext || !cronJobName || !namespace) {
        setLoading(false);
        setError("Missing required parameters");
        return;
      }

      try {
        setLoading(true);

        // Get cronjob details
        const data = await getResource<'cronjobs'>(
          currentContext.name,
          'cronjobs',
          cronJobName,
          namespace,
          'batch' // API group for cronjobs
        );

        setCronJobData(data);
        setError(null);

        // Fetch related events
        await fetchEvents();
      } catch (err) {
        console.error('Error fetching cronjob:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch cronjob data');
      } finally {
        setLoading(false);
      }
    };

    fetchCronJobData();
  }, [currentContext, namespace, cronJobName]);

  // Fetch child jobs after cronjob data is loaded
  useEffect(() => {
    if (cronJobData) {
      fetchJobs();
    }
  }, [cronJobData]);

  // Handle refresh data
  const handleRefresh = () => {
    setLoading(true);
    // Refetch data
    if (currentContext && cronJobName && namespace) {
      Promise.all([
        getResource<'cronjobs'>(
          currentContext.name,
          'cronjobs',
          cronJobName,
          namespace,
          'batch'
        ),
        fetchEvents(),
        fetchJobs()
      ]).then(([data]) => {
        setCronJobData(data);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh data');
        setLoading(false);
      });
    }
  };

  // Format date time for display
  const formatDateTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Calculate the next scheduled run time
  const getNextScheduledTime = () => {
    if (!cronJobData || !cronJobData.spec?.schedule) {
      return 'Unknown';
    }

    // This is a placeholder. In practice, calculating the next cron run time 
    // requires a cron parser library like 'cron-parser'
    return 'Use a cron parser to calculate next run';
  };

  // Get cronjob status
  const getCronJobStatus = () => {
    if (!cronJobData) {
      return { status: 'Unknown', isSuspended: false };
    }

    const isSuspended = cronJobData.spec?.suspend === true;
    
    if (isSuspended) {
      return { status: 'Suspended', isSuspended: true };
    }

    const lastScheduleTime = cronJobData.status?.lastScheduleTime;
    const lastSuccessfulTime = cronJobData.status?.lastSuccessfulTime;

    if (lastScheduleTime && !lastSuccessfulTime) {
      return { status: 'Active', isSuspended: false };
    }

    return { status: 'Scheduled', isSuspended: false };
  };

  // Status component for cronjob
  const CronJobStatusAlert = () => {
    const { status, isSuspended } = getCronJobStatus();

    if (isSuspended) {
      return (
        <Alert className="mb-6 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertTitle>CronJob is Suspended</AlertTitle>
          <AlertDescription>
            This CronJob is currently suspended and will not schedule new jobs until it is resumed.
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  // Get the job status counts
  const getJobStatusCounts = () => {
    if (!jobs || jobs.length === 0) {
      return { active: 0, succeeded: 0, failed: 0 };
    }

    return jobs.reduce((counts, job) => {
      const active = job.status?.active || 0;
      const succeeded = job.status?.succeeded || 0;
      const failed = job.status?.failed || 0;

      if (active > 0) {
        counts.active++;
      } else if (succeeded > 0) {
        counts.succeeded++;
      } else if (failed > 0) {
        counts.failed++;
      }

      return counts;
    }, { active: 0, succeeded: 0, failed: 0 });
  };

  // Calculate cronjob age
  const getCronJobAge = () => {
    if (!cronJobData?.metadata?.creationTimestamp) {
      return 'N/A';
    }

    const creationTime = new Date(cronJobData.metadata.creationTimestamp);
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

  // Parse cron schedule to human-readable format
  const parseCronSchedule = (schedule: string) => {
    // This is a very simplified parser, production code would use a library
    const parts = schedule.split(' ');
    
    if (parts.length !== 5) {
      return schedule; // Return original if not standard cron format
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Every minute';
    }

    if (minute.match(/^\d+$/) && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every hour at ${minute} minutes past the hour`;
    }

    if (minute.match(/^\d+$/) && hour.match(/^\d+$/) && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return `Every day at ${hour}:${minute.padStart(2, '0')}`;
    }

    if (minute.match(/^\d+$/) && hour.match(/^\d+$/) && dayOfMonth === '*' && month === '*' && dayOfWeek.match(/^\d+$/)) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = days[parseInt(dayOfWeek) % 7];
      return `Every ${day} at ${hour}:${minute.padStart(2, '0')}`;
    }

    // For other patterns, just return the raw schedule
    return schedule;
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
          <AlertTitle>Error loading cronjob data</AlertTitle>
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

  // If no cronjob data
  if (!cronJobData || !cronJobData.metadata) {
    return (
      <div className="p-6">
        <Alert>
          <AlertTitle>No cronjob data available</AlertTitle>
          <AlertDescription>
            The requested cronjob was not found or could not be retrieved.
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

  // Get job counts and status
  const jobCounts = getJobStatusCounts();
  const { status } = getCronJobStatus();
  const statusColor = status === 'Suspended' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400';

  return (
    <div className='
           max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
      <div className="p-6 max-w-7xl mx-auto">
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
              <BreadcrumbLink href="/dashboard/explore/cronjobs">CronJobs</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href={`/dashboard/explore/cronjobs?namespace=${namespace}`}>{namespace}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <ChevronRight className="h-4 w-4" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink>{cronJobData.metadata.name}</BreadcrumbLink>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{cronJobData.metadata.name}</h1>
                <Badge
                  className={`${status === 'Suspended'
                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'}`}
                >
                  {status}
                </Badge>
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                Namespace: <span onClick={() => navigate(`/dashboard/explore/namespaces/${cronJobData.metadata?.namespace}`)} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">{cronJobData.metadata.namespace}</span>
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
            </div>
          </div>
        </div>

        {/* Status alert if needed */}
        <CronJobStatusAlert />

        {/* Main content tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="yaml">YAML</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 bg-transparent">
            {/* CronJob Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-medium">Schedule</h3>
                </div>
                <div className="text-lg font-semibold">
                  {cronJobData.spec?.schedule || 'Not scheduled'}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {cronJobData.spec?.schedule ? parseCronSchedule(cronJobData.spec.schedule) : 'No schedule defined'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <History className="h-4 w-4 text-purple-500" />
                  <h3 className="text-sm font-medium">Last Scheduled</h3>
                </div>
                <div className="text-lg font-semibold">
                  {cronJobData.status?.lastScheduleTime ? 
                    new Date(cronJobData.status.lastScheduleTime).toLocaleDateString() : 
                    'Never'
                  }
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {cronJobData.status?.lastScheduleTime ? 
                    new Date(cronJobData.status.lastScheduleTime).toLocaleTimeString() : 
                    'No jobs scheduled yet'
                  }
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="h-4 w-4 text-green-500" />
                  <h3 className="text-sm font-medium">Jobs History</h3>
                </div>
                <div className="text-lg font-semibold">
                  {jobs.length}
                </div>
                <div className="flex gap-2 text-xs mt-1">
                  <span className="text-green-600 dark:text-green-400">{jobCounts.succeeded} succeeded</span>
                  <span className="text-blue-600 dark:text-blue-400">{jobCounts.active} active</span>
                  <span className="text-red-600 dark:text-red-400">{jobCounts.failed} failed</span>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium">Status</h3>
                </div>
                <div className={`text-lg font-semibold ${statusColor}`}>
                  {status}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Created {getCronJobAge()} ago
                </div>
              </div>
            </div>

            {/* CronJob Properties */}
            <PropertiesViewer
              metadata={cronJobData.metadata}
              kind="CronJob"
              status={status}
              additionalProperties={[
                {
                  label: "Schedule",
                  value: cronJobData.spec?.schedule || 'Not set'
                },
                {
                  label: "Concurrency Policy",
                  value: cronJobData.spec?.concurrencyPolicy || 'Allow'
                },
                {
                  label: "Suspend",
                  value: cronJobData.spec?.suspend === true ? 'Yes' : 'No'
                },
                {
                  label: "Starting Deadline",
                  value: cronJobData.spec?.startingDeadlineSeconds ? 
                    `${cronJobData.spec.startingDeadlineSeconds}s` : 
                    'Not set'
                },
                {
                  label: "History Limit",
                  value: (
                    <div>
                      Successful: {cronJobData.spec?.successfulJobsHistoryLimit || 3}, 
                      Failed: {cronJobData.spec?.failedJobsHistoryLimit || 1}
                    </div>
                  )
                }
              ]}
            />

            {/* Schedule Information */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Schedule Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Cron Schedule</div>
                  <div className="font-medium">{cronJobData.spec?.schedule || 'Not set'}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {cronJobData.spec?.schedule ? parseCronSchedule(cronJobData.spec.schedule) : 'No schedule defined'}
                  </div>
                </div>
                
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Last Schedule Time</div>
                  <div className="font-medium">
                    {cronJobData.status?.lastScheduleTime ? 
                      formatDateTime(cronJobData.status.lastScheduleTime?.toString()) : 
                      'Never scheduled'
                    }
                  </div>
                </div>
                
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Last Successful Time</div>
                  <div className="font-medium">
                    {cronJobData.status?.lastSuccessfulTime ? 
                      formatDateTime(cronJobData.status.lastSuccessfulTime?.toString()) : 
                      'No successful jobs yet'
                    }
                  </div>
                </div>
                
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Time Zone</div>
                  <div className="font-medium">
                    {cronJobData.spec?.timeZone || 'UTC (Default)'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The time zone used when calculating the schedule
                  </div>
                </div>
              </div>
            </div>

            {/* Job Template */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4 mb-6">
              <h2 className="text-lg font-medium mb-4">Job Template</h2>
              <div className="space-y-4">
                {/* Template configurations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium mb-1">Completions</div>
                    <div>{cronJobData.spec?.jobTemplate?.spec?.completions || 1}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">Parallelism</div>
                    <div>{cronJobData.spec?.jobTemplate?.spec?.parallelism || 1}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">Backoff Limit</div>
                    <div>{cronJobData.spec?.jobTemplate?.spec?.backoffLimit || 6}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium mb-1">Active Deadline</div>
                    <div>
                      {cronJobData.spec?.jobTemplate?.spec?.activeDeadlineSeconds ? 
                        `${cronJobData.spec.jobTemplate.spec.activeDeadlineSeconds}s` : 
                        'No deadline'
                      }
                    </div>
                  </div>
                </div>

                {/* Template Containers */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Containers</h3>
                  <div className="space-y-2">
                    {cronJobData.spec?.jobTemplate?.spec?.template?.spec?.containers.map((container, index) => (
                      <div
                        key={container.name}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                      >
                        <div className="font-medium mb-1">{container.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          Image: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">{container.image}</code>
                        </div>

                        {/* Command & Args */}
                        {container.command && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Command:</div>
                            <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded block text-xs overflow-auto">
                              {container.command.join(' ')}
                            </code>
                          </div>
                        )}

                        {container.args && container.args.length > 0 && (
                          <div className="mt-2 text-sm">
                            <div className="font-medium mb-1">Args:</div>
                            <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded block text-xs overflow-auto">
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
                    {cronJobData.spec?.jobTemplate?.spec?.template?.spec?.restartPolicy || 'Never'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Recent Jobs */}
            {jobs.length > 0 && (
              <div className="rounded-lg border bg-white dark:bg-gray-900/30 p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-medium">Recent Jobs</h2>
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Refresh
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-transparent divide-y divide-gray-200 dark:divide-gray-800">
                      {jobs.slice(0, 5).map((job) => {
                        let statusColor = '';
                        let status = 'Unknown';
                        
                        if (job.status?.active && job.status.active > 0) {
                          status = 'Running';
                          statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
                        } else if (job.status?.succeeded && job.status.succeeded > 0) {
                          status = 'Completed';
                          statusColor = 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
                        } else if (job.status?.failed && job.status.failed > 0) {
                          status = 'Failed';
                          statusColor = 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
                        }
                        
                        return (
                          <tr key={job.metadata?.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Button
                                variant="link"
                                className="p-0 h-auto font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={() => navigate(`/dashboard/explore/jobs/${namespace}/${job.metadata?.name}`)}
                              >
                                {job.metadata?.name}
                              </Button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                              {formatDateTime(job.metadata?.creationTimestamp?.toString())}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={statusColor}>
                                {status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => navigate(`/dashboard/explore/jobs/${namespace}/${job.metadata?.name}`)}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {jobs.length > 5 && (
                  <div className="mt-4 text-center">
                    <Button 
                      variant="outline"
                      onClick={() => navigate(`/dashboard/explore/jobs?namespace=${namespace}&labelSelector=job-name=${cronJobData.metadata?.name}`)}
                    >
                      View All Jobs
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* CronJob Events */}
            <EventsViewer
              events={events}
              resourceName={cronJobData.metadata.name}
              resourceKind="CronJob"
              namespace={cronJobData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="yaml" className="space-y-6">
            <ResourceViewerYamlTab
              resourceData={cronJobData}
              namespace={cronJobData.metadata.namespace || ''}
              currentContext={currentContext}
            />
          </TabsContent>

          <TabsContent value="events" className="space-y-6">
            <EventsViewer
              events={events}
              namespace={cronJobData.metadata.namespace}
            />
          </TabsContent>

          <TabsContent value="jobs" className="space-y-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-medium">Jobs History</h2>
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Refresh
                </Button>
              </div>
              
              {jobs.length === 0 ? (
                <div className="text-center p-6 text-gray-500 dark:text-gray-400">
                  No jobs have been created by this CronJob yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-transparent">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Completed</th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-transparent divide-y divide-gray-200 dark:divide-gray-800">
                      {jobs.map((job) => {
                        let statusColor = '';
                        let status = 'Unknown';
                        
                        if (job.status?.active && job.status.active > 0) {
                          status = 'Running';
                          statusColor = 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
                        } else if (job.status?.succeeded && job.status.succeeded > 0) {
                          status = 'Completed';
                          statusColor = 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
                        } else if (job.status?.failed && job.status.failed > 0) {
                          status = 'Failed';
                          statusColor = 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
                        }
                        
                        return (
                          <tr key={job.metadata?.name} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Button
                                variant="link"
                                className="p-0 h-auto font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                onClick={() => navigate(`/dashboard/explore/jobs/${namespace}/${job.metadata?.name}`)}
                              >
                                {job.metadata?.name}
                              </Button>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                              {formatDateTime(job.metadata?.creationTimestamp?.toString())}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                              {job.status?.completionTime ? formatDateTime(job.status.completionTime?.toString()) : '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <Badge className={statusColor}>
                                {status}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => navigate(`/dashboard/explore/jobs/${namespace}/${job.metadata?.name}`)}
                              >
                                View
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default CronJobViewer;