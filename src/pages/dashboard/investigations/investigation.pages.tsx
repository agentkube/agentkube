import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, FileText, Clock, CheckCircle, XCircle, AlertCircle, Search, ChevronLeft, ChevronsLeft, ChevronsRight, MoreVertical, TrendingUp, Trash2, RotateCcw, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, Play, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { listTasks, getTaskDetails, deleteTask } from '@/api/task';
import { TaskDetails } from '@/types/task';
import DemoVideoDialog from '@/components/custom/demovideodialog/demovideodialog.component';
import { DEMO_VIDEOS } from '@/constants/demo.constants';
import { useBackgroundTask } from '@/contexts/useBackgroundTask';
import BackgroundTaskDialog from '@/components/custom/backgroundtaskdialog/backgroundtaskdialog.component';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'title' | 'severity' | 'status' | 'duration' | 'created' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Use TaskDetails directly from API
type Task = TaskDetails;

interface StatCardProps {
  count: number;
  label: string;
  timeframe: string;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ count, label, timeframe, icon, color }) => (
  <div
    style={{
      opacity: 1,
      transform: 'translateY(0px)'
    }}
    className="flex-1"
  >
    <div className="flex-1 bg-gray-400/10 dark:bg-transparent border border-gray-200 dark:border-gray-800/50 rounded-md p-3 flex flex-col justify-end min-h-[150px]">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-5xl font-light text-gray-900 dark:text-gray-200">
            {count}
          </h2>
          <h3 className="text-xs font-medium text-gray-900 dark:text-gray-100">
            {label}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {timeframe}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${color}`}>
          {icon}
        </div>
      </div>

    </div>
  </div>
);

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange
}) => {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  const getVisiblePages = () => {
    const pages = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 3; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between mt-6 px-4 py-3 bg-gray-50 dark:bg-gray-800/10 rounded-lg">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Showing {startItem} to {endItem} of {totalItems} tasks
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="h-8 w-8 p-0"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {getVisiblePages().map((page, index) => (
          <Button
            key={index}
            variant={page === currentPage ? "default" : "outline"}
            size="sm"
            onClick={() => typeof page === 'number' && onPageChange(page)}
            disabled={typeof page !== 'number'}
            className="h-8 w-8 p-0"
          >
            {page}
          </Button>
        ))}

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="h-8 w-8 p-0"
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

const formatAge = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) {
    return `${diffDays}d ago`;
  } else if (diffHours > 0) {
    return `${diffHours}h ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes}m ago`;
  } else {
    return 'Just now';
  }
};


const Investigations: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('all');

  const navigate = useNavigate();
  const { isOpen: isBackgroundTaskOpen, onClose: closeBackgroundTask, setIsOpen } = useBackgroundTask();

  // Search and pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);

  // Refresh state
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // For demo dialog and animation
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [isWatchDemoExpanded, setIsWatchDemoExpanded] = useState(false);

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    task: Task | null;
  }>({
    isOpen: false,
    task: null
  });

  // Fetch tasks from API
  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const taskList = await listTasks(100); // Get up to 100 tasks

      setTasks(taskList);
      setError(null);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);


  // Refresh all data
  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchTasks();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchTasks]);

  // Initial load
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Reset to page 1 when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTab]);

  // Watch Demo button animation effect
  useEffect(() => {
    const expandTimer = setTimeout(() => {
      setIsWatchDemoExpanded(true);
    }, 500);
    
    const collapseTimer = setTimeout(() => {
      setIsWatchDemoExpanded(false);
    }, 3000); // 500ms + 2500ms = 3000ms total
    
    return () => {
      clearTimeout(expandTimer);
      clearTimeout(collapseTimer);
    };
  }, []);

  const getFilteredTasks = useMemo(() => {
    let filtered = tasks;

    // Filter by tab
    if (selectedTab !== 'all') {
      const statusMap: Record<string, string> = {
        'completed': 'completed',
        'ongoing': 'processed',
        'stopped': 'cancelled'
      };
      filtered = filtered.filter(task => task.status === statusMap[selectedTab]);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const lowercaseQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(task => {
        const title = task.title.toLowerCase();
        const status = task.status.toLowerCase();
        const severity = task.severity.toLowerCase();
        const tags = task.tags.join(' ').toLowerCase();

        return title.includes(lowercaseQuery) ||
          status.includes(lowercaseQuery) ||
          severity.includes(lowercaseQuery) ||
          tags.includes(lowercaseQuery) ||
          task.task_id.toLowerCase().includes(lowercaseQuery);
      });
    }

    return filtered;
  }, [tasks, selectedTab, searchQuery]);

  // Sort tasks based on sort state
  const sortedTasks = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return getFilteredTasks;
    }

    return [...getFilteredTasks].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'title':
          return (a.title || '').localeCompare(b.title || '') * sortMultiplier;

        case 'severity': {
          const severityOrder: Record<string, number> = {
            'critical': 1,
            'high': 2,
            'medium': 3,
            'low': 4
          };
          const orderA = severityOrder[a.severity] || 10;
          const orderB = severityOrder[b.severity] || 10;
          return (orderA - orderB) * sortMultiplier;
        }

        case 'status': {
          const statusOrder: Record<string, number> = {
            'processed': 1,
            'completed': 2,
            'cancelled': 3
          };
          const orderA = statusOrder[a.status] || 10;
          const orderB = statusOrder[b.status] || 10;
          return (orderA - orderB) * sortMultiplier;
        }

        case 'duration': {
          const durationA = a.duration || 0;
          const durationB = b.duration || 0;
          return (durationA - durationB) * sortMultiplier;
        }

        case 'created': {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return (timeA - timeB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [getFilteredTasks, sort.field, sort.direction]);

  const getPastWeekTasks = () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return tasks.filter(task =>
      new Date(task.created_at) >= oneWeekAgo
    );
  };

  const getCompletedTasks = () =>
    tasks.filter(task => task.status === 'completed');

  const getOngoingTasks = () =>
    tasks.filter(task => task.status === 'processed');

  const handleNavigateToTask = (taskId: string) => {
    navigate(`/dashboard/tasks/report/${taskId}`);
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'processed':
        return <Clock className="w-4 h-4 text-blue-600" />;
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-gray-600" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: Task['status']) => {
    const statusConfig = {
      'completed': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300',
      'processed': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300',
      'cancelled': 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300'
    };

    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium ${statusConfig[status]}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  const getSeverityBadge = (severity: Task['severity']) => {
    const severityConfig = {
      'critical': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300',
      'high': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300',
      'medium': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300 border-yellow-200',
      'low': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
    };

    return (
      <span className={`px-2 py-1 rounded-md text-xs font-medium ${severityConfig[severity]}`}>
        {severity.toUpperCase()}
      </span>
    );
  };

  // Handler functions for dropdown actions
  const handleDeleteTask = (task: Task) => {
    setDeleteDialog({
      isOpen: true,
      task: task
    });
  };

  const confirmDeleteTask = async () => {
    if (!deleteDialog.task) return;

    try {
      // Call the delete task API
      const response = await deleteTask(deleteDialog.task.task_id);

      if (response.status === 'success') {
        // Remove the task from local state immediately for better UX
        setTasks(prevTasks => prevTasks.filter(t => t.task_id !== deleteDialog.task!.task_id));

        toast(response.message || 'Task deleted successfully');
      }
    } catch (err) {
      console.error('Error deleting task:', err);
      // Show error message to user
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete task';
      toast.error(`Error deleting task: ${errorMessage}`);

      // Refresh data in case of error to ensure consistency
      refreshAllData();
    } finally {
      // Close the dialog
      setDeleteDialog({
        isOpen: false,
        task: null
      });
    }
  };

  const cancelDeleteTask = () => {
    setDeleteDialog({
      isOpen: false,
      task: null
    });
  };

  const handleViewTask = (task: Task) => {
    handleNavigateToTask(task.task_id);
  };

  const handleReRunTask = (task: Task) => {
    console.log('Re-run task:', task.task_id);
    // TODO: Implement re-run task API call
    // For now, just refresh the data
    refreshAllData();
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

  return (
    <div className="
      max-h-[93vh] overflow-y-auto
      
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="p-6 mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Tasks</h1>

          <div className="flex gap-2 items-center">
            {/* Watch Demo Button */}
            <Button
              onClick={() => setIsDemoOpen(true)}
              className="flex items-center justify-between gap-2 relative overflow-hidden"
            >
              <motion.div
                initial={{ width: 40 }}
                animate={{ 
                  width: isWatchDemoExpanded ? 144 : 14 
                }}
                transition={{ 
                  duration: 0.4,
                  ease: "easeInOut"
                }}
                className="flex items-center justify-between gap-2"
              >
                <Play className="w-4 h-4 flex-shrink-0" />
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ 
                    opacity: isWatchDemoExpanded ? 1 : 0,
                    width: isWatchDemoExpanded ? 'auto' : 0
                  }}
                  transition={{ 
                    duration: 0.3,
                    delay: isWatchDemoExpanded ? 0.2 : 0,
                    ease: "easeOut"
                  }}
                  className="whitespace-nowrap text-sm overflow-hidden"
                >
                  Watch Demo
                </motion.span>
              </motion.div>
            </Button>

            {/* Refresh Button */}
            <Button
              variant="outline"
              onClick={refreshAllData}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 text-gray-600 dark:text-gray-300 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Refresh
              </span>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-8">
          <StatCard
            count={getPastWeekTasks().length}
            label="Tasks Past 7 Days"
            timeframe="Past Week"
            icon={<Clock className="w-6 h-6 text-blue-600" />}
            color="bg-blue-100 dark:bg-blue-900/20"
          />
          <StatCard
            count={getCompletedTasks().length}
            label="Complete Tasks"
            timeframe="All time"
            icon={<CheckCircle className="w-6 h-6 text-green-600" />}
            color="bg-green-100 dark:bg-green-900/20"
          />
          <StatCard
            count={getOngoingTasks().length}
            label="Ongoing Tasks"
            timeframe="All time"
            icon={<AlertCircle className="w-6 h-6 text-orange-600" />}
            color="bg-orange-100 dark:bg-orange-900/20"
          />
        </div>

        {/* Tabs and Results */}
        <div>
          <Tabs
            value={selectedTab}
            onValueChange={setSelectedTab}
            className="w-full"
          >
            <div className='flex justify-between'>
              <TabsList className='dark:bg-transparent'>
                {["all", "completed", "ongoing", "stopped"].map((tab) => (
                  <TabsTrigger key={tab} value={tab} className='text-xs'>
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    {tab === 'all' && ` (${tasks.length})`}
                    {tab === 'completed' && ` (${getCompletedTasks().length})`}
                    {tab === 'ongoing' && ` (${getOngoingTasks().length})`}
                    {tab === 'stopped' && ` (${tasks.filter((task: Task) => task.status === 'cancelled').length})`}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Search Bar */}
              <div className="w-full max-w-md">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search tasks by name, status, or severity..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 border-gray-300 dark:border-gray-600/20"
                  />
                </div>
              </div>
            </div>

            <div className="py-6">
              {loading ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
                  Loading tasks...
                </div>
              ) : error ? (
                <div className="text-center text-red-500 py-8">{error}</div>
              ) : (
                <>
                  {/* Tasks Table using Shadcn components */}
                  <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
                    <div className="rounded-md border">
                      <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
                        <TableHeader>
                          <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                            <TableHead
                              className="cursor-pointer hover:text-blue-500"
                              onClick={() => handleSort('title')}
                            >
                              Task {renderSortIndicator('title')}
                            </TableHead>
                            <TableHead
                              className="text-center cursor-pointer hover:text-blue-500"
                              onClick={() => handleSort('severity')}
                            >
                              Severity {renderSortIndicator('severity')}
                            </TableHead>
                            <TableHead className="text-center">Tags</TableHead>
                            <TableHead
                              className="text-center cursor-pointer hover:text-blue-500"
                              onClick={() => handleSort('status')}
                            >
                              Status {renderSortIndicator('status')}
                            </TableHead>
                            <TableHead
                              className='text-center cursor-pointer hover:text-blue-500'
                              onClick={() => handleSort('duration')}
                            >
                              Duration {renderSortIndicator('duration')}
                            </TableHead>
                            <TableHead
                              className='text-center cursor-pointer hover:text-blue-500'
                              onClick={() => handleSort('created')}
                            >
                              Created {renderSortIndicator('created')}
                            </TableHead>
                            <TableHead className="w-[50px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getFilteredTasks.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-12">
                                <div className="flex flex-col items-center gap-4">
                                  <div className="text-gray-500 dark:text-gray-400">
                                    {searchQuery ? (
                                      <>No tasks found matching "{searchQuery}"</>
                                    ) : (
                                      <>No tasks found for the selected filter</>
                                    )}
                                  </div>
                                  {!searchQuery && selectedTab === 'all' && (
                                    <Button
                                      onClick={() => setIsOpen(true)}
                                      className="flex items-center justify-between min-w-44 gap-2"
                                    >
                                      <Plus className="h-4 w-4" />
                                      <span className="text-sm">
                                        Investigation Task
                                      </span>
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            sortedTasks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((task: Task) => (
                            <TableRow
                              key={task.task_id}
                              className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                              onClick={() => handleNavigateToTask(task.task_id)}
                            >
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-3">
                                  {getStatusIcon(task.status)}
                                  <div>
                                    <div className="hover:text-blue-500 hover:underline font-medium text-xs">
                                      {task.title}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      ID: {task.task_id}
                                    </div>
                                  </div>
                                </div>
                              </TableCell>

                              <TableCell className="text-center">
                                {getSeverityBadge(task.severity)}
                              </TableCell>

                              <TableCell className="text-center">
                                <div className="flex flex-wrap gap-1 justify-center">
                                  {task.tags.slice(0, 2).map((tag: string, index: number) => (
                                    <span key={index} className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700/30 border border-gray-500/40 dark:border-gray-600/50  text-xs rounded">
                                      {tag}
                                    </span>
                                  ))}
                                  {task.tags.length > 2 && (
                                    <span className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700/30 border border-gray-500/40 dark:border-gray-600/50 text-xs rounded">
                                      +{task.tags.length - 2}
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              <TableCell className='w-[120px] text-center'>
                                {getStatusBadge(task.status)}
                              </TableCell>

                              <TableCell className='text-center dark:text-gray-400'>
                                {task.duration ? (() => {
                                  const minutes = Math.floor(task.duration / 60);
                                  const seconds = task.duration % 60;
                                  if (minutes > 0) {
                                    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
                                  }
                                  return `${seconds}s`;
                                })() : ''}
                              </TableCell>

                              <TableCell className='text-center dark:text-gray-400'>
                                {formatAge(task.created_at)}
                              </TableCell>

                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                      }}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-md border-gray-800/50'>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleViewTask(task);
                                      }}
                                      className='hover:text-gray-700 dark:hover:text-gray-500'
                                    >
                                      <FileText className="mr-2 h-4 w-4" />
                                      View Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReRunTask(task);
                                      }}
                                      className='hover:text-gray-700 dark:hover:text-gray-500'
                                    >
                                      <RotateCcw className="mr-2 h-4 w-4" />
                                      Re-run Task
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTask(task);
                                      }}
                                      className='hover:text-gray-700 dark:hover:text-gray-500 text-red-600 dark:text-red-400'
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>

                            </TableRow>
                          ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>

                  {/* Pagination */}
                  {Math.ceil(sortedTasks.length / itemsPerPage) > 1 && (
                    <Pagination
                      currentPage={currentPage}
                      totalPages={Math.ceil(sortedTasks.length / itemsPerPage)}
                      totalItems={sortedTasks.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                    />
                  )}
                </>
              )}
            </div>
          </Tabs>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={(open) => !open && cancelDeleteTask()}>
        <DialogContent className="sm:max-w-md dark:bg-[#0B0D13]/40 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the task "{deleteDialog.task?.title}"?
              <br /><br />
              This action cannot be undone and will remove the task and all its associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDeleteTask}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteTask}>
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demo Dialog */}
      <DemoVideoDialog
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        videoUrl={DEMO_VIDEOS.INVESTIGATION_CLIP_DEMO.videoUrl}
        title={DEMO_VIDEOS.INVESTIGATION_CLIP_DEMO.title}
      />

      {/* Background Task Dialog */}
      <BackgroundTaskDialog
        isOpen={isBackgroundTaskOpen}
        onClose={closeBackgroundTask}
      />
    </div>
  );
};

export default Investigations;