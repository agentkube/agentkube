import React, { useState } from 'react';
import { CoreV1Event } from '@kubernetes/client-node';
import { calculateAge } from '@/utils/age';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Filter, Clock, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";

interface EventsViewerProps {
  events: CoreV1Event[];
  resourceName?: string;
  resourceKind?: string;
  namespace?: string;
}

const EventsViewer: React.FC<EventsViewerProps> = ({
  events,
  resourceName,
  resourceKind,
  namespace
}) => {
  const [showAll, setShowAll] = useState(false);
  
  // Filter events for the specific resource if resourceName is provided
  const filteredEvents = resourceName 
    ? events.filter(event => 
        event.involvedObject?.name === resourceName &&
        (!resourceKind || event.involvedObject?.kind === resourceKind) &&
        (!namespace || event.involvedObject?.namespace === namespace)
      )
    : events;
  
  // Limit the number of events shown unless showAll is true
  const displayEvents = showAll ? filteredEvents : filteredEvents.slice(0, 10);
  
  // Sort events by last timestamp (most recent first)
  const sortedEvents = [...displayEvents].sort((a, b) => {
    const timeA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
    const timeB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
    return timeB - timeA;
  });
  
  // Determine event type (Normal, Warning)
  const getEventTypeColor = (type?: string) => {
    if (!type) return "bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    
    switch (type) {
      case 'Normal':
        return "bg-green-100 hover:bg-green-200 text-green-800 dark:bg-green-900/30 dark:hover:dark:bg-green-900/10 dark:text-green-300";
      case 'Warning':
        return "bg-yellow-100 hover:bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:hover:bg-yellow-900/10  dark:text-yellow-300";
      default:
        return "bg-gray-200 hover:bg-gray-200 text-gray-800 dark:bg-gray-800 dark:hover:bg-gray-800/20 dark:text-gray-200";
    }
  };
  
  // Get event icon based on type
  const getEventIcon = (type?: string) => {
    if (type === 'Warning') {
      return <AlertCircle className="h-3.5 w-3.5 mr-1 text-yellow-600 dark:text-yellow-400" />;
    }
    return <CheckCircle className="h-3.5 w-3.5 mr-1 text-green-600 dark:text-green-400" />;
  };
  
  // Format event count
  const formatCount = (count?: number) => {
    if (!count || count <= 1) return '';
    return `(${count}×)`;
  };
  
  if (sortedEvents.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-800/50 bg-white dark:bg-transparent p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Events</h2>
        </div>
        <div className="text-gray-500 dark:text-gray-400 text-center py-6">
          No events found for this resource.
        </div>
      </div>
    );
  }
  
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800/50 bg-white dark:bg-transparent p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">Events</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="h-8 flex items-center gap-1 bg-gray-50 dark:bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            className="h-8 flex items-center gap-1 bg-gray-50 dark:bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50"
            onClick={() => setShowAll(!showAll)}
          >
            <Filter className="h-3.5 w-3.5" />
            <span>{showAll ? 'Show Less' : 'Show All'}</span>
          </Button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 dark:border-gray-800">
              <TableHead className="w-[120px]">Time</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[120px]">Reason</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[120px]">From</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEvents.map((event, index) => (
              <TableRow 
                key={`${event.metadata?.uid}-${index}`}
                className="border-b border-gray-200 dark:border-gray-800"
              >
                <TableCell className="align-top py-2">
                  <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="h-3.5 w-3.5 mr-1" />
                    {calculateAge(event.lastTimestamp?.toString() || event.metadata?.creationTimestamp?.toString())}
                  </div>
                </TableCell>
                <TableCell className="align-top py-2">
                  <Badge className={getEventTypeColor(event.type)}>
                    <div className="flex items-center">
                      {getEventIcon(event.type)}
                      {event.type || 'Unknown'}
                    </div>
                  </Badge>
                </TableCell>
                <TableCell className="align-top text-sm font-medium py-2">
                  {event.reason} {formatCount(event.count)}
                </TableCell>
                <TableCell className="align-top text-sm py-2">
                  {event.message}
                </TableCell>
                <TableCell className="align-top text-sm text-gray-500 dark:text-gray-400 py-2">
                  {event.source?.component}
                  {event.source?.host && (
                    <div className="text-xs">{event.source.host}</div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {filteredEvents.length > 10 && !showAll && (
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(true)}
          >
            Show all {filteredEvents.length} events
          </Button>
        </div>
      )}
    </div>
  );
};

export default EventsViewer;