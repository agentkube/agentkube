import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CoreV1Event } from '@kubernetes/client-node';
import {
  listResources
} from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';

// Component imports
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { ChevronRight, AlertCircle, ArrowLeft, RefreshCw, Clock, Info, Search, Bell, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

const EventsViewer: React.FC = () => {
  const [events, setEvents] = useState<CoreV1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const { currentContext } = useCluster();
  const { namespace } = useParams<{ namespace?: string }>();
  const navigate = useNavigate();

  // Fetch events
  useEffect(() => {
    const fetchEvents = async () => {
      if (!currentContext) {
        setLoading(false);
        setError("No cluster context selected");
        return;
      }

      try {
        setLoading(true);

        // Get events
        const eventData = await listResources<'events'>(
          currentContext.name,
          'events',
          namespace ? { namespace } : {}
        );

        // Sort events by lastTimestamp (newest first by default)
        const sortedEvents = sortEvents(eventData, sortOrder);
        setEvents(sortedEvents);
        setError(null);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch events');
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [currentContext, namespace, sortOrder]);

  // Handle refresh
  const handleRefresh = () => {
    setLoading(true);
    // Refetch events
    if (currentContext) {
      listResources<'events'>(
        currentContext.name,
        'events',
        namespace ? { namespace } : {}
      ).then((eventData) => {
        const sortedEvents = sortEvents(eventData, sortOrder);
        setEvents(sortedEvents);
        setLoading(false);
      }).catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to refresh events');
        setLoading(false);
      });
    }
  };

  // Sort events
  const sortEvents = (events: CoreV1Event[], order: 'newest' | 'oldest'): CoreV1Event[] => {
    return [...events].sort((a, b) => {
      const timeA = a.lastTimestamp || a.eventTime || a.metadata?.creationTimestamp || '';
      const timeB = b.lastTimestamp || b.eventTime || b.metadata?.creationTimestamp || '';

      if (order === 'newest') {
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      } else {
        return new Date(timeA).getTime() - new Date(timeB).getTime();
      }
    });
  };

  // Filter events based on search query and type filter
  const filteredEvents = events.filter(event => {
    const matchesSearch = searchQuery === '' ||
      (event.message && event.message.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (event.reason && event.reason.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (event.involvedObject?.name && event.involvedObject.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (event.involvedObject?.kind && event.involvedObject.kind.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType = typeFilter === 'all' ||
      (typeFilter === 'normal' && event.type === 'Normal') ||
      (typeFilter === 'warning' && event.type === 'Warning');

    return matchesSearch && matchesType;
  });

  // Format date time for display
  const formatDateTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Calculate time since for display
  const getTimeSince = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';

    const eventTime = new Date(timestamp).getTime();
    const now = new Date().getTime();
    const diffMs = now - eventTime;

    // Format time since
    if (diffMs < 60000) {
      return `${Math.round(diffMs / 1000)}s ago`;
    } else if (diffMs < 3600000) {
      return `${Math.round(diffMs / 60000)}m ago`;
    } else if (diffMs < 86400000) {
      return `${Math.round(diffMs / 3600000)}h ago`;
    } else {
      return `${Math.round(diffMs / 86400000)}d ago`;
    }
  };

  // Get badge color for event type
  const getEventTypeColor = (type: string | undefined): string => {
    if (!type) return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';

    switch (type) {
      case 'Warning':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'Normal':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
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
          <AlertTitle>Error loading events</AlertTitle>
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

  return (
    <div className='
      max-h-[92vh] overflow-y-auto
      
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
              <BreadcrumbLink onClick={() => navigate('/dashboard/explore/events')}>Events</BreadcrumbLink>
            </BreadcrumbItem>
            {namespace && (
              <>
                <BreadcrumbSeparator>
                  <ChevronRight className="h-4 w-4" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbLink onClick={() => navigate(`/dashboard/explore/events?namespace=${namespace}`)}>{namespace}</BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header section */}
        <div className="mb-6">
          <div className="flex justify-between items-start mb-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">Events</h1>
                {namespace && (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    {namespace}
                  </Badge>
                )}
              </div>
              <div className="text-gray-500 dark:text-gray-400">
                {namespace
                  ? `Events in the ${namespace} namespace`
                  : 'Events across all namespaces'}
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

        {/* Search and filter controls */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
            <Input
              type="text"
              placeholder="Search events by message, reason, or involved object..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="flex gap-2">
            <div className="w-40">
              <Select
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value)}
              >
                <SelectTrigger className="h-10">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-40">
              <Select
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as 'newest' | 'oldest')}
              >
                <SelectTrigger className="h-10">
                  <Clock className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort order" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Events summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell className="h-4 w-4 text-blue-500" />
              <h3 className="text-xs font-medium">Total Events</h3>
            </div>
            <div className="text-2xl font-semibold">
              {events.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {filteredEvents.length} events after filtering
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-green-500" />
              <h3 className="text-xs font-medium">Normal Events</h3>
            </div>
            <div className="text-2xl font-semibold">
              {events.filter(event => event.type === 'Normal').length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Standard system events
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <h3 className="text-xs font-medium">Warning Events</h3>
            </div>
            <div className="text-2xl font-semibold">
              {events.filter(event => event.type === 'Warning').length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Events that might require attention
            </div>
          </div>
        </div>

        {/* Events table */}
        {filteredEvents.length === 0 ? (
          <Card className="p-6 text-center">
            <div className="text-gray-500 dark:text-gray-400">
              {events.length === 0
                ? 'No events found in the cluster'
                : 'No events match your search criteria'}
            </div>
          </Card>
        ) : (
          <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
            <div className="rounded-md border">
              <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
                <TableHeader className='text-xs'>
                  <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                    <TableHead className="w-1/6">Time</TableHead>
                    <TableHead className="w-1/12">Type</TableHead>
                    <TableHead className="w-1/6">Reason</TableHead>
                    <TableHead className="w-1/6">Object</TableHead>
                    <TableHead className="w-1/12">Count</TableHead>
                    <TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className='text-xs'>
                  {filteredEvents.map((event) => (
                    <TableRow
                      key={`${event.metadata?.namespace}-${event.metadata?.name}`}
                      className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                    >
                      <TableCell className="whitespace-nowrap font-medium">
                        <div className="flex flex-col">
                          <span>{getTimeSince(event.lastTimestamp?.toString() || event.eventTime?.toString() || event.metadata?.creationTimestamp?.toString())}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDateTime(event.lastTimestamp?.toString() || event.eventTime?.toString() || event.metadata?.creationTimestamp?.toString())}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getEventTypeColor(event.type)}>
                          {event.type || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {event.reason || 'N/A'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className='cursor-pointer text-blue-500 hover:underline' onClick={() => navigate(`/dashboard/explore/${event.involvedObject.kind?.toLocaleLowerCase() + 's'}/${event.metadata?.namespace}/${event.involvedObject.name}`)}>
                            {event.involvedObject?.kind || 'Unknown'}/{event.involvedObject?.name || 'unknown'}
                          </span>
                          {event.involvedObject?.namespace && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {event.involvedObject.namespace}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {event.count || 1}
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        <div className="truncate hover:text-clip" title={event.message}>
                          {event.message || 'No message'}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default EventsViewer;