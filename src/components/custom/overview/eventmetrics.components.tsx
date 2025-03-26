import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from 'react-router-dom';
import { listResources, getEvents } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { CoreV1Event as V1Event } from '@kubernetes/client-node';

const EventMetricsCard: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const [events, setEvents] = useState<V1Event[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch Events 
  useEffect(() => {
    const fetchEvents = async () => {
      if (!currentContext) {
        setEvents([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Using getEvents helper function which is properly typed
        const eventsData = await getEvents(currentContext.name);
        setEvents(eventsData);
      } catch (err) {
        console.error('Failed to fetch Events:', err);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
    
    // Refresh every 30 seconds
    const intervalId = setInterval(fetchEvents, 30000);
    
    return () => clearInterval(intervalId);
  }, [currentContext]);

  // Calculate event statistics
  const warningEvents = events.filter(event => event.type === 'Warning');
  const normalEvents = events.filter(event => event.type === 'Normal');
  
  // Function to get the most appropriate timestamp
  const getEventTime = (event: V1Event): Date => {
    // Prefer eventTime, then lastTimestamp, then firstTimestamp, then creationTimestamp
    if (event.eventTime) return new Date(event.eventTime);
    if (event.lastTimestamp) return new Date(event.lastTimestamp);
    if (event.firstTimestamp) return new Date(event.firstTimestamp);
    if (event.metadata?.creationTimestamp) return new Date(event.metadata.creationTimestamp);
    return new Date(0); // Fallback to epoch
  };
  
  // Find the most recent warning events (up to 2)
  const recentWarnings = [...warningEvents]
    .sort((a, b) => getEventTime(b).getTime() - getEventTime(a).getTime())
    .slice(0, 2);

  return (
    <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
      <CardContent className="p-6">
        <div className="flex justify-between">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Events</h3>
          <div className="p-1 rounded-full bg-amber-500/20">
            <AlertCircle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
          </div>
        </div>
        
        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {loading ? "..." : warningEvents.length}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Warning Events
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-3xl font-bold text-gray-900 dark:text-green-400">
              {loading ? "..." : normalEvents.length}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Normal Events
            </div>
          </div>
        </div>
        
        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="text-sm text-gray-500 dark:text-gray-400">Loading alerts...</div>
          ) : recentWarnings.length > 0 ? (
            recentWarnings.map((event, index) => (
              <div key={index} className="flex items-center text-xs">
                <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                <span className="text-gray-700 dark:text-gray-300 truncate" title={event.message || ''}>
                  {event.reason}: {event.message ? event.message.substring(0, 35) + (event.message.length > 35 ? '...' : '') : ''}
                </span>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 dark:text-gray-400">No warning events found</div>
          )}
        </div>
        
        <div className="mt-4 pt-2 border-t border-gray-100 dark:border-gray-800/50">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full justify-center text-gray-800 dark:text-white hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            onClick={() => navigate('/dashboard/explore/events')}
          >
            View all events <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EventMetricsCard;