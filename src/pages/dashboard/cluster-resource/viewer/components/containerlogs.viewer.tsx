import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  RefreshCw,
  Download,
  Trash2,
  Clock,
  AlertCircle,
  ChevronDown,
  CheckIcon,
  Search,
  XCircle,
  ArrowUp,
  ArrowDown,
  MessageSquare
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { OPERATOR_URL } from '@/config';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';
import LogAnalyzer from '@/components/custom/loganalyzer/loganalyzer.component';

interface ContainerLogsProps {
  podName: string;
  namespace: string;
  clusterName: string;
  containers: string[];
  onAddToChat?: (text: string) => void; // Add this prop for the chat functionality
}

// Log time filter options
const TIME_FILTER_OPTIONS = [
  { label: "5m ago", value: "5m" },
  { label: "10m ago", value: "10m" },
  { label: "30m ago", value: "30m" },
  { label: "1h ago", value: "1h" },
  { label: "6h ago", value: "6h" },
  { label: "24h ago", value: "24h" },
  { label: "7d ago", value: "7d" },
  { label: "30d ago", value: "30d" },
  { label: "All Logs", value: "all" },
  { label: "Terminated", value: "terminated" }
];

// Log line with timestamp parsing
interface LogLine {
  timestamp: Date | null;
  content: string;
  raw: string;
}

const ContainerLogs: React.FC<ContainerLogsProps> = ({
  podName,
  namespace,
  clusterName,
  containers,
  onAddToChat
}) => {
  const { addStructuredContent } = useDrawer();
  const [selectedContainer, setSelectedContainer] = useState<string>(containers[0] || '');
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [rawLogs, setRawLogs] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string>("10m");
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [tail, setTail] = useState<number>(100); // Number of lines to fetch
  const [isLive, setIsLive] = useState<boolean>(false);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);
  const [searchVisible, setSearchVisible] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1);
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionWidget, setSelectionWidget] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const selectionWidgetRef = useRef<HTMLDivElement>(null);

  // Effect to handle auto-scrolling when new logs come in
  useEffect(() => {
    if (isFollowing && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isFollowing]);
  
  // Effect to handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle CMD+F or CTRL+F to open search
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setSearchVisible(true);
        setTimeout(() => {
          if (searchInputRef.current) {
            searchInputRef.current.focus();
          }
        }, 100);
      }
      
      // Handle Escape to close search
      if (e.key === 'Escape' && searchVisible) {
        setSearchVisible(false);
        setSearchQuery('');
        setSearchMatches([]);
        setCurrentMatchIndex(-1);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchVisible]);

  // Effect to handle text selection
  useEffect(() => {
    const handleSelectionChange = () => {
      // Don't show widget if no logs are available or still loading
      if (logs.length === 0) {
        setSelectionWidget({ x: 0, y: 0, visible: false });
        setSelectedText('');
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectionWidget({ x: 0, y: 0, visible: false });
        setSelectedText('');
        return;
      }

      const text = selection.toString().trim();
      if (text.length === 0) {
        setSelectionWidget({ x: 0, y: 0, visible: false });
        setSelectedText('');
        return;
      }

      const range = selection.getRangeAt(0);
      const logContainer = logContainerRef.current;
      
      if (!logContainer) {
        setSelectionWidget({ x: 0, y: 0, visible: false });
        setSelectedText('');
        return;
      }

      // Check if selection is within the logs container
      let isWithinLogContainer = false;
      try {
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;
        
        // Check if selection is within log container
        isWithinLogContainer = logContainer.contains(startContainer) && logContainer.contains(endContainer);
      } catch (error) {
        console.warn('Error checking selection container:', error);
        isWithinLogContainer = false;
      }

      if (!isWithinLogContainer) {
        setSelectionWidget({ x: 0, y: 0, visible: false });
        setSelectedText('');
        return;
      }

      // Position the widget relative to the log container
      try {
        const rect = range.getBoundingClientRect();
        const containerRect = logContainer.getBoundingClientRect();
        
        // Make sure we have valid dimensions
        if (rect.width === 0 && rect.height === 0) {
          setSelectionWidget({ x: 0, y: 0, visible: false });
          setSelectedText('');
          return;
        }
        
        // Calculate position relative to the log container's scroll position
        const scrollTop = logContainer.scrollTop;
        const scrollLeft = logContainer.scrollLeft;
        
        // Position relative to container, accounting for scroll
        const x = rect.left - containerRect.left + scrollLeft + (rect.width / 2);
        const y = rect.top - containerRect.top + scrollTop - 45; // 45px above selection
        
        setSelectedText(text);
        setSelectionWidget({
          x: Math.max(50, Math.min(x, logContainer.clientWidth - 100)), // Keep within bounds
          y: Math.max(10, y), // Don't go above container
          visible: true
        });
      } catch (error) {
        console.warn('Error positioning selection widget:', error);
        setSelectionWidget({ x: 0, y: 0, visible: false });
        setSelectedText('');
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Only handle if mouse up is within log container
      const logContainer = logContainerRef.current;
      if (logContainer && logContainer.contains(e.target as Node)) {
        // Small delay to ensure selection is complete
        setTimeout(handleSelectionChange, 50);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const logContainer = logContainerRef.current;
      const isClickInWidget = selectionWidgetRef.current?.contains(e.target as Node);
      const isClickInLogs = logContainer?.contains(e.target as Node);
      
      if (!isClickInWidget && !isClickInLogs) {
        setSelectionWidget({ x: 0, y: 0, visible: false });
        setSelectedText('');
        // Clear selection
        window.getSelection()?.removeAllRanges();
      }
    };

    // Use mouseup for more reliable detection
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [logs.length]);
  
  // Effect to handle search
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchMatches([]);
      setCurrentMatchIndex(-1);
      return;
    }
    
    const matches: number[] = [];
    logs.forEach((log, index) => {
      const content = (log.timestamp ? formatTimestamp(log.timestamp) : '') + log.content;
      if (content.toLowerCase().includes(searchQuery.toLowerCase())) {
        matches.push(index);
      }
    });
    
    setSearchMatches(matches);
    setCurrentMatchIndex(matches.length > 0 ? 0 : -1);
    
    // Scroll to first match
    if (matches.length > 0 && logContainerRef.current) {
      const logElements = logContainerRef.current.querySelectorAll('pre');
      if (logElements[matches[0]]) {
        logElements[matches[0]].scrollIntoView({ block: 'center' });
      }
    }
  }, [searchQuery, logs]);

  // Effect to set up auto-refresh interval
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshIntervalRef.current = setInterval(() => {
        fetchLogs();
      }, 5000); // Auto-refresh every 5 seconds
    } else if (autoRefreshIntervalRef.current) {
      clearInterval(autoRefreshIntervalRef.current);
      autoRefreshIntervalRef.current = null;
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [autoRefresh, selectedContainer, timeFilter, tail]);

  // Effect to detect when container changes
  useEffect(() => {
    // Clear logs when container changes
    setLogs([]);
    setRawLogs('');
    setError(null);

    // Fetch logs for the newly selected container
    fetchLogs();
  }, [selectedContainer]);

  // Parse a log line to extract timestamp
  const parseLogLine = (line: string): LogLine => {
    // Try to match ISO timestamp at beginning of line
    // This regex matches common timestamp formats in container logs
    const timestampRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)/;
    const match = line.match(timestampRegex);

    if (match && match[1]) {
      const timestamp = new Date(match[1]);
      // If timestamp is valid, extract it from the content
      if (!isNaN(timestamp.getTime())) {
        return {
          timestamp,
          content: line.substring(match[0].length),
          raw: line
        };
      }
    }

    // If no timestamp found or invalid, return the whole line as content
    return {
      timestamp: null,
      content: line,
      raw: line
    };
  };

  // Format the timestamp for display
  const formatTimestamp = (timestamp: Date | null): string => {
    if (!timestamp) return '';

    // Format as HH:MM:SS.ms
    return timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 2
    });
  };

  // Convert time filter to seconds for API request
  const getTimeFilterSeconds = (): number | undefined => {
    if (timeFilter === 'all' || timeFilter === 'terminated') {
      return undefined; // No time filter
    }

    const value = parseInt(timeFilter.replace(/[a-z]/g, ''));
    const unit = timeFilter.replace(/[0-9]/g, '');

    switch (unit) {
      case 'm': return value * 60;
      case 'h': return value * 60 * 60;
      case 'd': return value * 24 * 60 * 60;
      default: return undefined;
    }
  };

  // Fetch logs from the API
  const fetchLogs = async () => {
    if (!selectedContainer || !podName || !namespace || !clusterName) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Build query parameters
      const params = new URLSearchParams();
      params.append('container', selectedContainer);
      params.append('tailLines', tail.toString());

      if (timeFilter === 'terminated') {
        params.append('previous', 'true');
      }

      const sinceSeconds = getTimeFilterSeconds();
      if (sinceSeconds) {
        params.append('sinceSeconds', sinceSeconds.toString());
      }

      if (showTimestamps) {
        params.append('timestamps', 'true');
      }

      // Get Pods Logs
      const response = await fetch(
        `${OPERATOR_URL}/clusters/${clusterName}/api/v1/namespaces/${namespace}/pods/${podName}/log?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'text/plain',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }

      const logText = await response.text();
      setRawLogs(logText);

      // Parse log lines and extract timestamps
      const logLines = logText.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => parseLogLine(line));

      setLogs(logLines);

      // Update "live" status if auto-refreshing
      if (autoRefresh) {
        setIsLive(true);
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError(err instanceof Error ? err.message : 'An error occurred fetching logs');
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle scrolling to detect if user has scrolled away from bottom
  const handleScroll = () => {
    if (!logContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
    const isAtBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 5;

    // Update following state based on scroll position
    setIsFollowing(isAtBottom);
  };

  // Clear logs
  const handleClearLogs = () => {
    setLogs([]);
    setRawLogs('');
  };

  // Download logs
  const handleDownloadLogs = () => {
    const element = document.createElement('a');
    const file = new Blob([rawLogs], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${podName}_${selectedContainer}_logs.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Update container selection
  const handleContainerChange = (value: string) => {
    setSelectedContainer(value);
  };

  // Update time filter
  const handleTimeFilterChange = (value: string) => {
    setTimeFilter(value);
    fetchLogs();
  };
  
  // Close search
  const handleCloseSearch = () => {
    setSearchVisible(false);
    setSearchQuery('');
    setSearchMatches([]);
    setCurrentMatchIndex(-1);
  };
  
  // Navigate to next search match
  const handleNextMatch = () => {
    if (searchMatches.length === 0) return;
    
    const nextIndex = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(nextIndex);
    
    if (logContainerRef.current) {
      const logElements = logContainerRef.current.querySelectorAll('pre');
      if (logElements[searchMatches[nextIndex]]) {
        logElements[searchMatches[nextIndex]].scrollIntoView({ block: 'center' });
      }
    }
  };
  
  // Navigate to previous search match
  const handlePrevMatch = () => {
    if (searchMatches.length === 0) return;
    
    const prevIndex = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prevIndex);
    
    if (logContainerRef.current) {
      const logElements = logContainerRef.current.querySelectorAll('pre');
      if (logElements[searchMatches[prevIndex]]) {
        logElements[searchMatches[prevIndex]].scrollIntoView({ block: 'center' });
      }
    }
  };

  // Handle adding selected text to chat
  const handleAddToChat = () => {
    if (selectedText) {
      const structuredContent = `**Container Logs** ${podName}/${selectedContainer}

\`\`\`
${selectedText}
\`\`\`

**Pod:** ${podName}
**Namespace:** ${namespace}
**Container:** ${selectedContainer}`;

      addStructuredContent(structuredContent, `Logs: ${podName}/${selectedContainer}`);
      toast({
        title: "Added to Chat",
        description: "Selected log content added to chat context"
      });

      // Also call the original onAddToChat if provided for backward compatibility
      if (onAddToChat) {
        const wrappedText = `\`\`\`\n${selectedText}\n\`\`\``;
        onAddToChat(wrappedText);
      }
      
      // Clear selection
      window.getSelection()?.removeAllRanges();
      setSelectionWidget({ x: 0, y: 0, visible: false });
      setSelectedText('');
    }
  };
  
  // Function to highlight search matches in text
  const renderHighlightedContent = (text: string) => {
    if (!searchQuery || searchQuery.trim() === '') {
      return text;
    }
    
    try {
      // Create a regular expression with the search query for splitting
      // Use case-insensitive matching with 'i' flag
      const regex = new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      
      // Split the text by the regex matches
      const parts = text.split(regex);
      
      // Map through the parts and wrap matches in mark tags
      return (
        <>
          {parts.map((part, i) => {
            // Check if this part matches the search query (case-insensitive)
            if (part.toLowerCase() === searchQuery.toLowerCase()) {
              return (
                <mark 
                  key={i} 
                  className="bg-yellow-200 dark:bg-yellow-800 text-black dark:text-white px-0.5 rounded-sm"
                >
                  {part}
                </mark>
              );
            }
            return part;
          })}
        </>
      );
    } catch (error) {
      // If there's an error in regex or rendering, return the original text
      console.error('Error highlighting text:', error);
      return text;
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-500/20 bg-white dark:bg-transparent p-4">
      <div className="space-y-4">
        {/* Header with controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-medium">Container Logs</h2>
            {isLive && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse"></span>
                Live
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setSearchVisible(!searchVisible)}
              title="Search logs (Cmd+F / Ctrl+F)"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Container selector */}
            <Select value={selectedContainer} onValueChange={handleContainerChange}>
              <SelectTrigger className="w-[180px] h-9 text-sm">
                <SelectValue placeholder="Select container" />
              </SelectTrigger>
              <SelectContent className="bg-gray-100 dark:bg-[#0B0D13]/30 backdrop-blur-sm">
                {containers.map(container => (
                  <SelectItem key={container} value={container}>{container}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Time filter dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1">
                  <Clock className="h-4 w-4" />
                  {TIME_FILTER_OPTIONS.find(opt => opt.value === timeFilter)?.label || 'Time'}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-gray-100 dark:bg-[#0B0D13]/30 backdrop-blur-sm">
                <DropdownMenuLabel>Time Range</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  {TIME_FILTER_OPTIONS.map(option => (
                    <DropdownMenuItem
                      key={option.value}
                      onClick={() => handleTimeFilterChange(option.value)}
                      className="cursor-pointer flex justify-between items-center hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200"
                    >
                      {option.label}
                      {timeFilter === option.value && (
                        <CheckIcon className="h-4 w-4" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLogs}
                disabled={loading}
                className="h-9"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Refresh</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadLogs}
                disabled={!rawLogs || loading}
                className="h-9"
              >
                <Download className="h-4 w-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleClearLogs}
                disabled={!logs.length || loading}
                className="h-9"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Search bar */}
        {searchVisible && (
          <div className="flex items-center gap-2 bg-white dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 ">
            <div className="relative flex-1">
              <Input
                ref={searchInputRef}
                className="pl-8 h-8 text-sm "
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.shiftKey ? handlePrevMatch() : handleNextMatch();
                  }
                }}
              />
              <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-6 w-6 p-0"
                  onClick={() => setSearchQuery('')}
                >
                  <XCircle className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={searchMatches.length === 0}
                onClick={handlePrevMatch}
                title="Previous match (Shift+Enter)"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                disabled={searchMatches.length === 0}
                onClick={handleNextMatch}
                title="Next match (Enter)"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {searchMatches.length > 0 
                  ? `${currentMatchIndex + 1}/${searchMatches.length}` 
                  : searchQuery 
                    ? "No matches" 
                    : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 ml-1"
                onClick={handleCloseSearch}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        
        {/* Options bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm border-b border-gray-200 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-4">
            {/* Show timestamps toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-timestamps"
                checked={showTimestamps}
                onCheckedChange={(checked) => setShowTimestamps(!!checked)}
              />
              <label
                htmlFor="show-timestamps"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Show Timestamps
              </label>
            </div>

            {/* Auto-refresh toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={(checked) => setAutoRefresh(!!checked)}
              />
              <label
                htmlFor="auto-refresh"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Auto Refresh
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            

            <span className="text-sm text-gray-500 dark:text-gray-400">
              Tail:
            </span>
            <Select value={tail.toString()} onValueChange={(value) => setTail(parseInt(value))}>
              <SelectTrigger className="w-[80px] h-8 text-sm">
                <SelectValue placeholder="Lines" />
              </SelectTrigger>
              <SelectContent className="bg-gray-100 dark:bg-[#0B0D13]/30 backdrop-blur-sm">
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
                <SelectItem value="5000">5000</SelectItem>
              </SelectContent>
            </Select>

            <LogAnalyzer
              logs={rawLogs}
              podName={podName}
              namespace={namespace}
              containerName={selectedContainer}
              clusterName={clusterName}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 p-3 rounded-md flex items-center gap-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <div className="text-sm">{error}</div>
          </div>
        )}

        {/* Logs display */}
        <div
          ref={logContainerRef}
          className="bg-gray-100 dark:bg-gray-500/10 p-4 rounded-lg overflow-auto h-[400px] font-mono text-sm 
          border border-gray-600/10 dark:border-gray-200/10
          overflow-y-auto relative
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
          "
          onScroll={handleScroll}
        >
          {/* Selection Widget */}
          {selectionWidget.visible && (
            <div
              ref={selectionWidgetRef}
              className="absolute z-50 rounded-lg shadow-lg  flex gap-2 bg-white dark:bg-[#1e1e1e]/80 backdrop-blur-sm border-gray-200 dark:border-gray-800/10"
              style={{
                left: `${selectionWidget.x}px`,
                top: `${selectionWidget.y}px`,
                transform: 'translateX(-50%)',
                pointerEvents: 'auto'
              }}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700"
                onClick={handleAddToChat}
              >
                <MessageSquare className="h-3 w-3" />
                Add to Chat
              </Button>
            </div>
          )}

          {loading && logs.length === 0 ? (
            <div className="flex justify-center items-center h-full text-gray-500 dark:text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex justify-center items-center h-full text-gray-500 dark:text-gray-400">
              No logs available for this container
            </div>
          ) : (
            logs.map((log, idx) => (
              <pre 
                key={idx} 
                className={`m-0 font-mono flex items-start break-all select-text ${searchMatches.includes(idx) && currentMatchIndex === searchMatches.indexOf(idx) ? 'bg-blue-100 dark:bg-blue-900/30' : ''}`}
              >
                {showTimestamps && log.timestamp && (
                  <span className="text-gray-500 dark:text-green-400 mr-2 flex-shrink-0">
                    [{formatTimestamp(log.timestamp)}]
                  </span>
                )}
                <span>{renderHighlightedContent(log.content)}</span>
              </pre>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Status bar */}
        <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
          <code className="text-gray-500 dark:text-gray-400">
            {!loading && `${logs.length} lines`}
            {loading && 'Loading...'}
          </code>
          <div>
            {!isFollowing && logs.length > 0 && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  setIsFollowing(true);
                  if (logsEndRef.current) {
                    logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                Scroll to bottom
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContainerLogs;