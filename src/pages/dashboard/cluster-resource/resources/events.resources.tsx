import React, { useState, useEffect, useMemo } from 'react';
import { listResources } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown, FileDown, RotateCcw, Filter, Sparkles, TextSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { ErrorComponent, NamespaceSelector } from '@/components/custom';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { toast } from '@/hooks/use-toast';
import { CoreV1Event as V1Event } from '@kubernetes/client-node';
import EventAnalyzer from '@/components/custom/eventanalyzer/eventanalyzer.component';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'involvedObject' | 'reason' | 'time' | 'message' | 'count' | 'type' | 'source' | 'namespace' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Define filter types
interface FilterState {
  type: string[];
  reason: string[];
  component: string[];
  involvedObjectKind: string[];
  timeRange: 'all' | '5min' | '15min' | '30min' | '1h' | '3h' | '6h' | '12h' | '24h';
  count: number;
  showDuplicates: boolean;
}

const Events: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [events, setEvents] = useState<V1Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

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
  
  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: 'time',
    direction: 'desc'
  });

  // Initialize filter state
  const [filters, setFilters] = useState<FilterState>({
    type: [],
    reason: [],
    component: [],
    involvedObjectKind: [],
    timeRange: 'all',
    count: 0,
    showDuplicates: true
  });

  // Track available filter options
  const [filterOptions, setFilterOptions] = useState<{
    types: string[];
    reasons: string[];
    components: string[];
    involvedObjectKinds: string[];
  }>({
    types: [],
    reasons: [],
    components: [],
    involvedObjectKinds: []
  });

  // Calculate time cutoff based on selected time range
  const getTimeCutoff = (timeRange: string): Date | null => {
    if (timeRange === 'all') return null;
    
    const now = new Date();
    const timeRangeMap: { [key: string]: number } = {
      '5min': 5 * 60 * 1000,
      '15min': 15 * 60 * 1000,
      '30min': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '3h': 3 * 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000
    };
    
    return new Date(now.getTime() - timeRangeMap[timeRange]);
  };

  // Fetch Events for all selected namespaces
  const fetchEvents = async () => {
    if (!currentContext || (selectedNamespaces.length === 0 && !refreshing)) {
      setEvents([]);
      setLoading(false);
      return;
    }

    try {
      if (!refreshing) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      // If no namespaces are selected, fetch from all namespaces
      let allEvents: V1Event[] = [];

      if (selectedNamespaces.length === 0) {
        try {
          // Using listResources with the correct type
          const eventsData = await listResources(currentContext.name, 'events');
          allEvents = eventsData;
        } catch (err) {
          console.error('Failed to fetch Events:', err);
          setError('Failed to fetch Events.');
          allEvents = [];
        }
      } else {
        // Fetch Events for each selected namespace
        const eventPromises = selectedNamespaces.map(async (namespace) => {
          try {
            return await listResources(currentContext.name, 'events', {
              namespace
            });
          } catch (err) {
            console.warn(`Failed to fetch Events for namespace ${namespace}:`, err);
            return [];
          }
        });
        const results = await Promise.all(eventPromises);
        allEvents = results.flat();
      }

      setEvents(allEvents);
      // Extract unique filter options
      const types = new Set<string>();
      const reasons = new Set<string>();
      const components = new Set<string>();
      const involvedObjectKinds = new Set<string>();

      allEvents.forEach(event => {
        if (event.type) types.add(event.type);
        if (event.reason) reasons.add(event.reason);
        if (event.source?.component) components.add(event.source.component);
        if (event.involvedObject?.kind) involvedObjectKinds.add(event.involvedObject.kind);
      });

      setFilterOptions({
        types: Array.from(types).sort(),
        reasons: Array.from(reasons).sort(),
        components: Array.from(components).sort(),
        involvedObjectKinds: Array.from(involvedObjectKinds).sort()
      });
      
      if (allEvents.length > 0) {
        setError(null);
      }
    } catch (err) {
      console.error('Failed to fetch events:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial fetch of events
  useEffect(() => {
    fetchEvents();
  }, [currentContext, selectedNamespaces]);

  // Auto refresh effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (autoRefresh) {
      intervalId = setInterval(() => {
        fetchEvents();
      }, 10000); // Refresh every 10 seconds
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [autoRefresh, currentContext, selectedNamespaces]);

  // Function to get the most appropriate timestamp
  const getEventTime = (event: V1Event): Date => {
    // Prefer eventTime, then lastTimestamp, then firstTimestamp, then creationTimestamp
    if (event.eventTime) return new Date(event.eventTime);
    if (event.lastTimestamp) return new Date(event.lastTimestamp);
    if (event.firstTimestamp) return new Date(event.firstTimestamp);
    if (event.metadata?.creationTimestamp) return new Date(event.metadata.creationTimestamp);
    return new Date(0); // Fallback to epoch
  };

  // Filter events based on search query and filters
  const filteredEvents = useMemo(() => {
    // Start with all events
    let filtered = [...events];
    
    // Apply type filter
    if (filters.type.length > 0) {
      filtered = filtered.filter(event => 
        event.type && filters.type.includes(event.type)
      );
    }
    
    // Apply reason filter
    if (filters.reason.length > 0) {
      filtered = filtered.filter(event => 
        event.reason && filters.reason.includes(event.reason)
      );
    }
    
    // Apply component filter
    if (filters.component.length > 0) {
      filtered = filtered.filter(event => 
        event.source?.component && filters.component.includes(event.source.component)
      );
    }
    
    // Apply involved object kind filter
    if (filters.involvedObjectKind.length > 0) {
      filtered = filtered.filter(event => 
        event.involvedObject?.kind && filters.involvedObjectKind.includes(event.involvedObject.kind)
      );
    }
    
    // Apply time range filter
    const timeCutoff = getTimeCutoff(filters.timeRange);
    if (timeCutoff) {
      filtered = filtered.filter(event => {
        const eventTime = getEventTime(event);
        return eventTime >= timeCutoff;
      });
    }
    
    // Apply count filter
    if (filters.count > 0) {
      filtered = filtered.filter(event => 
        (event.count || 1) >= filters.count
      );
    }
    
    // Skip duplicate filtering if showDuplicates is true
    if (!filters.showDuplicates) {
      const eventMap = new Map<string, V1Event>();
      
      // Group by reason + involved object + message to find duplicates
      filtered.forEach(event => {
        const key = `${event.reason}-${event.involvedObject?.kind}-${event.involvedObject?.name}-${event.message}`;
        
        // If we haven't seen this event yet, or this one is more recent
        if (!eventMap.has(key) || getEventTime(event) > getEventTime(eventMap.get(key)!)) {
          eventMap.set(key, event);
        }
      });
      
      filtered = Array.from(eventMap.values());
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const lowercaseQuery = searchQuery.toLowerCase();
      
      filtered = filtered.filter(event => {
        // Search in message
        if (event.message?.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }
        
        // Search in reason
        if (event.reason?.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }
        
        // Search in involved object
        if (event.involvedObject?.name?.toLowerCase().includes(lowercaseQuery) ||
            event.involvedObject?.kind?.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }
        
        // Search in namespace
        if (event.metadata?.namespace?.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }
        
        // Search in source
        if (event.source?.component?.toLowerCase().includes(lowercaseQuery) ||
            event.source?.host?.toLowerCase().includes(lowercaseQuery)) {
          return true;
        }
        
        return false;
      });
    }
    
    return filtered;
  }, [events, searchQuery, filters]);

  // Sort events based on sort state
  const sortedEvents = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredEvents;
    }

    return [...filteredEvents].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'involvedObject': {
          const kindA = a.involvedObject?.kind || '';
          const kindB = b.involvedObject?.kind || '';
          
          // First sort by kind
          const kindCompare = kindA.localeCompare(kindB);
          if (kindCompare !== 0) {
            return kindCompare * sortMultiplier;
          }
          
          // Then by name
          const nameA = a.involvedObject?.name || '';
          const nameB = b.involvedObject?.name || '';
          return nameA.localeCompare(nameB) * sortMultiplier;
        }

        case 'reason': {
          const reasonA = a.reason || '';
          const reasonB = b.reason || '';
          return reasonA.localeCompare(reasonB) * sortMultiplier;
        }

        case 'time': {
          const timeA = getEventTime(a).getTime();
          const timeB = getEventTime(b).getTime();
          return (timeA - timeB) * sortMultiplier;
        }

        case 'message': {
          const messageA = a.message || '';
          const messageB = b.message || '';
          return messageA.localeCompare(messageB) * sortMultiplier;
        }

        case 'count': {
          const countA = a.count || 1;
          const countB = b.count || 1;
          return (countA - countB) * sortMultiplier;
        }

        case 'type': {
          const typeA = a.type || '';
          const typeB = b.type || '';
          return typeA.localeCompare(typeB) * sortMultiplier;
        }

        case 'source': {
          const sourceA = a.source?.component || '';
          const sourceB = b.source?.component || '';
          return sourceA.localeCompare(sourceB) * sortMultiplier;
        }

        case 'namespace': {
          const namespaceA = a.metadata?.namespace || '';
          const namespaceB = b.metadata?.namespace || '';
          return namespaceA.localeCompare(namespaceB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredEvents, sort.field, sort.direction]);

  const handleEventDetails = (event: V1Event) => {
    if (event.metadata?.name && event.metadata?.namespace) {
      navigate(`/dashboard/explore/events/${event.metadata.namespace}/${event.metadata.name}`);
    }
  };

  // Format the time display for events
  const formatEventTime = (event: V1Event): string => {
    const eventTime = getEventTime(event);
    
    const now = new Date();
    const diffMs = now.getTime() - eventTime.getTime();
    
    // If less than a minute, show seconds
    if (diffMs < 60000) {
      return `${Math.floor(diffMs / 1000)}s ago`;
    }
    
    // If less than an hour, show minutes
    if (diffMs < 3600000) {
      return `${Math.floor(diffMs / 60000)}m ago`;
    }
    
    // If less than a day, show hours and minutes
    if (diffMs < 86400000) {
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      return `${hours}h ${minutes}m ago`;
    }
    
    // Otherwise, show days
    const days = Math.floor(diffMs / 86400000);
    return `${days}d ago`;
  };

  // Format involved object for display
  const formatInvolvedObject = (event: V1Event): JSX.Element => {
    if (!event.involvedObject) {
      return <span className="text-gray-500 dark:text-gray-400">Unknown</span>;
    }
    
    return (
      <div className="flex flex-col">
        <div className="flex items-center">
          <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mr-2">
            {event.involvedObject.kind}
          </span>
        </div>
        <span className="mt-1 text-xs hover:text-blue-500 hover:underline cursor-pointer" onClick={() => navigate(`/dashboard/explore/${event.involvedObject.kind?.toLocaleLowerCase()+'s'}/${event.metadata?.namespace}/${event.involvedObject.name}`)}>
          {event.involvedObject.name}
        </span>
      </div>
    );
  };

  // Format event type for display
  const formatEventType = (event: V1Event): JSX.Element => {
    const type = event.type || 'Unknown';
    
    let bgColor, textColor;
    switch (type) {
      case 'Normal':
        bgColor = 'bg-green-100 dark:bg-green-900/20';
        textColor = 'text-green-800 dark:text-green-300';
        break;
      case 'Warning':
        bgColor = 'bg-amber-100 dark:bg-amber-900/20';
        textColor = 'text-amber-800 dark:text-amber-300';
        break;
      case 'Error':
        bgColor = 'bg-red-100 dark:bg-red-900/20';
        textColor = 'text-red-800 dark:text-red-300';
        break;
      default:
        bgColor = 'bg-gray-100 dark:bg-gray-900/20';
        textColor = 'text-gray-800 dark:text-gray-300';
    }
    
    return (
      <span className={`px-2 py-0.5 rounded-[0.3rem] text-xs font-medium ${bgColor} ${textColor}`}>
        {type}
      </span>
    );
  };

  // Format count for display
  const formatCount = (event: V1Event): JSX.Element => {
    const count = event.count || 1;
    
    let bgColor, textColor;
    if (count > 100) {
      bgColor = 'bg-red-100 dark:bg-red-900/20';
      textColor = 'text-red-800 dark:text-red-300';
    } else if (count > 10) {
      bgColor = 'bg-amber-100 dark:bg-amber-900/20';
      textColor = 'text-amber-800 dark:text-amber-300';
    } else {
      bgColor = 'bg-blue-100 dark:bg-blue-900/20';
      textColor = 'text-blue-800 dark:text-blue-300';
    }
    
    return (
      <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${bgColor} ${textColor}`}>
        {count}
      </span>
    );
  };

  // Format source for display
  const formatSource = (event: V1Event): JSX.Element => {
    if (!event.source) {
      return <span className="text-gray-500 dark:text-gray-400">Unknown</span>;
    }
    
    return (
      <div className="flex flex-col">
        <span className="font-medium">
          {event.source.component || 'Unknown'}
        </span>
        {event.source.host && (
          <span className="text-gray-500 dark:text-gray-400">
            {event.source.host}
          </span>
        )}
      </div>
    );
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
      return ;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  // Handle filter changes
  const handleFilterChange = (
    filterType: keyof FilterState,
    value: string | number | boolean | string[]
  ) => {
    setFilters((prev) => ({
      ...prev,
      [filterType]: value,
    }));
  };

  // Export events to JSON file
  const exportEvents = () => {
    const eventsJson = JSON.stringify(sortedEvents, null, 2);
    const blob = new Blob([eventsJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `kubernetes-events-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({
      type: [],
      reason: [],
      component: [],
      involvedObjectKind: [],
      timeRange: 'all',
      count: 0,
      showDuplicates: true
    });
    setSearchQuery('');
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
      <div className='flex items-center justify-between md:flex-row gap-4 items-start md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Events</h1>
          <div className="flex items-center gap-2 mt-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by reason, object, message..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
            
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1 flex items-center dark:bg-transparent dark:text-gray-400 border-gray-400 dark:border-gray-800">
                    <Filter className="h-4 w-4" />
                    <span>Filter</span>
                    {(filters.type.length > 0 || 
                      filters.reason.length > 0 || 
                      filters.component.length > 0 || 
                      filters.involvedObjectKind.length > 0 || 
                      filters.timeRange !== 'all' || 
                      filters.count > 0 || 
                      !filters.showDuplicates) && (
                      <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center rounded-full bg-blue-500 text-white">
                        {filters.type.length + 
                         filters.reason.length + 
                         filters.component.length + 
                         filters.involvedObjectKind.length + 
                         (filters.timeRange !== 'all' ? 1 : 0) + 
                         (filters.count > 0 ? 1 : 0) + 
                         (!filters.showDuplicates ? 1 : 0)}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 dark:bg-[#0B0D13]/30 backdrop-blur-md dark:text-gray-400 border-gray-400 dark:border-gray-800">
                  <div className="space-y-4">
                    <h4 className="font-medium mb-2">Event Filters</h4>
                    
                    {/* Type Filter */}
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">Event Type</h5>
                      <div className="grid grid-cols-2 gap-2">
                        {filterOptions.types.map(type => (
                          <div key={type} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`type-${type}`} 
                              checked={filters.type.includes(type)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  handleFilterChange('type', [...filters.type, type]);
                                } else {
                                  handleFilterChange('type', filters.type.filter(t => t !== type));
                                }
                              }}
                            />
                            <Label htmlFor={`type-${type}`}>{type}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Time Range Filter */}
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">Time Range</h5>
                      <ToggleGroup 
                        type="single" 
                        value={filters.timeRange}
                        onValueChange={(value) => {
                          if (value) handleFilterChange('timeRange', value);
                        }}
                        className="justify-start flex-wrap"
                      >
                        <ToggleGroupItem value="all" size="sm">All</ToggleGroupItem>
                        <ToggleGroupItem value="5min" size="sm">5m</ToggleGroupItem>
                        <ToggleGroupItem value="15min" size="sm">15m</ToggleGroupItem>
                        <ToggleGroupItem value="30min" size="sm">30m</ToggleGroupItem>
                        <ToggleGroupItem value="1h" size="sm">1h</ToggleGroupItem>
                        <ToggleGroupItem value="3h" size="sm">3h</ToggleGroupItem>
                        <ToggleGroupItem value="6h" size="sm">6h</ToggleGroupItem>
                        <ToggleGroupItem value="12h" size="sm">12h</ToggleGroupItem>
                        <ToggleGroupItem value="24h" size="sm">24h</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                    
                    {/* Involved Object Filter */}
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">Resource Kind</h5>
                      <div className="max-h-32 overflow-y-auto pr-2 space-y-1
                      [&::-webkit-scrollbar]:w-1.5 
                      [&::-webkit-scrollbar-track]:bg-transparent 
                      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                      [&::-webkit-scrollbar-thumb]:rounded-full
                      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
                      ">
                        {filterOptions.involvedObjectKinds.map(kind => (
                          <div key={kind} className="flex items-center space-x-2">
                            <Checkbox 
                              id={`kind-${kind}`} 
                              checked={filters.involvedObjectKind.includes(kind)}
                              className="h-4 w-4 dark:bg-gray-800"
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  handleFilterChange('involvedObjectKind', [...filters.involvedObjectKind, kind]);
                                } else {
                                  handleFilterChange('involvedObjectKind', filters.involvedObjectKind.filter(k => k !== kind));
                                }
                              }}
                            />
                            <Label htmlFor={`kind-${kind}`}>{kind}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Additional Filters */}
                    <div className="space-y-2">
                      <h5 className="text-sm font-medium">Additional Options</h5>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="show-duplicates" 
                          checked={filters.showDuplicates}
                          className="h-4 w-4 dark:bg-gray-800"
                          onCheckedChange={(checked) => {
                            handleFilterChange('showDuplicates', !!checked);
                          }}
                        />
                        <Label htmlFor="show-duplicates">Show Duplicate Events</Label>
                      </div>
                    </div>
                    
                    {/* Filter Actions */}
                    <div className="flex justify-between pt-2">
                      <Button variant="outline" size="sm" className='dark:bg-gray-900 dark:text-gray-400 border-gray-400 dark:border-gray-800' onClick={clearFilters}>
                        Clear Filters
                      </Button>
                      <Button size="sm" 
                        variant="outline"
                        onClick={() => {
                        // Close popover by clicking outside
                        document.body.click();
                      }}>
                        Apply
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => fetchEvents()}
                disabled={refreshing}
                className="gap-1 dark:bg-transparent dark:text-gray-400 border-gray-400 dark:border-gray-800"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                <span>Refresh</span>
              </Button>
              
              <div className="flex items-center space-x-1">
                <Switch 
                  id="auto-refresh" 
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                  size="sm"
                />
                <Label htmlFor="auto-refresh" className="text-xs">Auto</Label>
              </div>
              
              <Button variant="outline" size="sm" className='dark:bg-transparent dark:text-gray-400 border-gray-400 dark:border-gray-800' onClick={exportEvents}>
                <FileDown className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>
        </div>

        <div className="w-full md:w-96">
          <div className="text-sm font-medium mb-2">Namespaces</div>
          <NamespaceSelector />
        </div>
      </div>
      
      {/* Event statistics */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-xl shadow-none">
          <div className="p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Events</div>
            <div className="text-2xl font-bold mt-1">{events.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {filteredEvents.length !== events.length && `Showing ${filteredEvents.length} after filtering`}
            </div>
          </div>
        </Card>
        
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-xl shadow-none">
          <div className="p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">Warning Events</div>
            <div className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              {events.filter(e => e.type === 'Warning').length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {events.length > 0 && 
                `${((events.filter(e => e.type === 'Warning').length / events.length) * 100).toFixed(1)}% of total`}
            </div>
          </div>
        </Card>
        
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-xl shadow-none">
          <div className="p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">Normal Events</div>
            <div className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">
              {events.filter(e => e.type === 'Normal').length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {events.length > 0 && 
                `${((events.filter(e => e.type === 'Normal').length / events.length) * 100).toFixed(1)}% of total`}
            </div>
          </div>
        </Card>
        
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-xl shadow-none">
          <div className="p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">Last Event</div>
            <div className="text-2xl font-bold mt-1">
              {events.length > 0 
                ? formatEventTime(events.sort((a, b) => getEventTime(b).getTime() - getEventTime(a).getTime())[0]) 
                : 'N/A'}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {events.length > 0 && new Date(getEventTime(events.sort((a, b) => 
                getEventTime(b).getTime() - getEventTime(a).getTime())[0])).toLocaleTimeString()}
            </div>
          </div>
        </Card>
      </div>

      {/* Active Filters Display */}
      {(filters.type.length > 0 || 
        filters.reason.length > 0 || 
        filters.component.length > 0 || 
        filters.involvedObjectKind.length > 0 || 
        filters.timeRange !== 'all' || 
        filters.count > 0 || 
        !filters.showDuplicates) && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm font-medium mr-1">Active Filters:</span>
          
          {filters.type.map(type => (
            <Badge key={`type-${type}`} variant="secondary" className="flex items-center gap-1 text-gray-500 dark:text-white bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
              Type: {type}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-4 w-4 p-0" 
                onClick={() => handleFilterChange('type', filters.type.filter(t => t !== type))}
              >
                ×
              </Button>
            </Badge>
          ))}
          
          {filters.involvedObjectKind.map(kind => (
            <Badge key={`kind-${kind}`} variant="secondary" className="flex items-center gap-1">
              Kind: {kind}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-4 w-4 p-0" 
                onClick={() => handleFilterChange('involvedObjectKind', filters.involvedObjectKind.filter(k => k !== kind))}
              >
                ×
              </Button>
            </Badge>
          ))}
          
          {filters.timeRange !== 'all' && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Time: Last {filters.timeRange}
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-4 w-4 p-0" 
                onClick={() => handleFilterChange('timeRange', 'all')}
              >
                ×
              </Button>
            </Badge>
          )}
          
          {!filters.showDuplicates && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Hide Duplicates
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-4 w-4 p-0" 
                onClick={() => handleFilterChange('showDuplicates', true)}
              >
                ×
              </Button>
            </Badge>
          )}
          
          <Button variant="ghost" size="sm" className="text-xs" onClick={clearFilters}>
            Clear All
          </Button>
        </div>
      )}

      {/* No events message */}
      {events.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No events matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No events found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Events found but filtered out */}
      {events.length > 0 && filteredEvents.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            No events match the current filters. Try adjusting your search criteria or filters.
          </AlertDescription>
        </Alert>
      )}

      {/* Events table */}
      {filteredEvents.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader className='text-xs'>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('type')}
                  >
                    Type {renderSortIndicator('type')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('reason')}
                  >
                    Reason {renderSortIndicator('reason')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500 w-[200px]"
                    onClick={() => handleSort('involvedObject')}
                  >
                    Object {renderSortIndicator('involvedObject')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('message')}
                  >
                    Message {renderSortIndicator('message')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('count')}
                  >
                    Count {renderSortIndicator('count')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('source')}
                  >
                    Source {renderSortIndicator('source')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('namespace')}
                  >
                    Namespace {renderSortIndicator('namespace')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('time')}
                  >
                    Age {renderSortIndicator('time')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEvents.map((event) => (
                  <TableRow
                    key={`${event.metadata?.namespace}-${event.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${
                      event.type === 'Warning' ? 'bg-amber-50/30 dark:bg-amber-900/5' : ''
                    }`}
                  >
                    <TableCell>
                      {formatEventType(event)}
                    </TableCell>
                    <TableCell className="font-medium" onClick={() => handleEventDetails(event)}>
                      <div className="hover:text-blue-500 hover:underline text-xs">
                        {event.reason}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatInvolvedObject(event)}
                    </TableCell>
                    <TableCell className="">
                      <div className="w-[350px] text-xs truncate hover:truncate-none hover:overflow-visible hover:whitespace-normal transition-all" title={event.message}>
                        {event.message}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {formatCount(event)}
                    </TableCell>
                    <TableCell className='text-xs w-56'>
                      {formatSource(event)}
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline text-xs" onClick={(e) => {
                        e.stopPropagation();
                        if (event.metadata?.namespace) {
                          // Add this namespace to filter if not already selected
                          if (!selectedNamespaces.includes(event.metadata.namespace)) {
                            // This would ideally update the namespace context but depends on your implementation
                            // updateSelectedNamespaces([...selectedNamespaces, event.metadata.namespace]);
                          }
                        }
                      }}>
                        {event.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell className='text-xs w-[70px]'>
                      {formatEventTime(event)}
                    </TableCell>
                    <TableCell>
                      {event.type === 'Warning' ? (
                        <EventAnalyzer
                          event={event}
                          clusterName={currentContext?.name || 'unknown'}
                        />
                      ) : (
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
                          <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-md border-gray-800/50'>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              toast({ title: "Ask AI", description: "Feature yet to be implemented" })
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Ask AI
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              // handleInvestigatePod(pod);
                            }} className='hover:text-gray-700 dark:hover:text-gray-500'>
                              <TextSearch className="mr-2 h-4 w-4" />
                              Investigate
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
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

export default Events;