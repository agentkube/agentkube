import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  TrendingUp,
  Server,
  Eye,
  MessageSquare,
  Calendar,
  Globe,
  Settings,
  Sparkles,
  ClipboardCheck,
  SearchCode,
  ArrowUpRight,
  Edit,
  Copy,
  Check,
  Logs
} from 'lucide-react';
import MarkdownContent from '@/utils/markdown-formatter';
import { SideDrawer, DrawerHeader, DrawerContent } from "@/components/ui/sidedrawer.custom";
import { Separator } from '@/components/ui/separator';
import { getTaskDetails, getInvestigationTaskDetails } from '@/api/task';
import { TaskDetails, SubTask, InvestigationTaskDetails, ResourceContext } from '@/types/task';
import { AgentkubeBot } from '@/assets/icons';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { nord } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CSSProperties } from 'react';
import { SiKubernetes } from '@icons-pack/react-simple-icons';

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;



const getTagColor = (tag: string): string => {
  const tagLower = tag.toLowerCase();

  const greenTags = ['active'];
  const redTags = ['impacting', 'danger', 'bug', 'failure', 'critical'];

  if (greenTags.some(term => tagLower.includes(term))) {
    return 'bg-emerald-400/60 text-green-800 dark:bg-green-900/20 dark:text-emerald-400';
  }

  if (redTags.some(term => tagLower.includes(term))) {
    return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
  }

  // Default cyan for all other tags
  return 'bg-cyan-300 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300';
};


const TaskReport: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const [taskDetails, setTaskDetails] = useState<TaskDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubTask, setSelectedSubTask] = useState<SubTask | null>(null);
  const [showPromptDrawer, setShowPromptDrawer] = useState(false);
  const [promptDetails, setPromptDetails] = useState<InvestigationTaskDetails | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [copied, setCopied] = useState(false);

  // Fetch task details from API
  const fetchTaskDetails = useCallback(async (isPolling = false) => {
    if (!taskId) {
      setError('No task ID provided');
      setLoading(false);
      return;
    }

    try {
      if (!isPolling) setLoading(true);
      const details = await getTaskDetails(taskId);
      setTaskDetails(details);
      setError(null);
    } catch (err) {
      console.error('Error fetching task details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch task details');
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [taskId]);

  // Polling effect
  useEffect(() => {
    fetchTaskDetails();
    
    let intervalId: NodeJS.Timeout;
    
    const startPolling = () => {
      intervalId = setInterval(() => {
        if (taskDetails?.status !== 'completed' && taskDetails?.status !== 'cancelled') {
          fetchTaskDetails(true);
        } else {
          clearInterval(intervalId);
        }
      }, 10000);
    };

    // Start polling after initial load
    const timeoutId = setTimeout(() => {
      if (taskDetails?.status !== 'completed' && taskDetails?.status !== 'cancelled') {
        startPolling();
      }
    }, 1000);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchTaskDetails, taskDetails?.status]);

  // Fetch prompt details from API
  const fetchPromptDetails = useCallback(async () => {
    if (!taskId) return;

    try {
      setPromptLoading(true);
      const details = await getInvestigationTaskDetails(taskId);
      setPromptDetails(details);
    } catch (err) {
      console.error('Error fetching prompt details:', err);
    } finally {
      setPromptLoading(false);
    }
  }, [taskId]);

  const handleViewPrompt = () => {
    setShowPromptDrawer(true);
    if (!promptDetails) {
      fetchPromptDetails();
    }
  };

  const customStyle: CSSProperties = {
    padding: '0.5rem',
    borderRadius: '0.5rem',
    background: 'transparent',
    fontSize: '0.75rem'
  };

  const handleEditPrompt = () => {
    if (promptDetails) {
      setEditedPrompt(promptDetails.prompt);
      setIsEditingPrompt(true);
    }
  };

  const handleSavePrompt = () => {
    setIsEditingPrompt(false);
  };

  const handleCancelEdit = () => {
    setIsEditingPrompt(false);
    setEditedPrompt('');
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  const isPromptModified = promptDetails && editedPrompt !== promptDetails.prompt;

  // Helper functions
  const getSubTaskStatus = (status: number): 'ISSUES FOUND' | 'ALL GOOD' => {
    return status === 0 ? 'ALL GOOD' : 'ISSUES FOUND';
  };

  const getSubTaskSeverity = (status: number): 'success' | 'error' => {
    return status === 0 ? 'success' : 'error';
  };

  const getSeverityColor = (severity: 'critical' | 'error' | 'warning' | 'info' | 'success' | string): string => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'warning': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300';
      case 'info': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'success': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: 'ISSUES FOUND' | 'ALL GOOD' | string): JSX.Element => {
    switch (status) {
      case 'ISSUES FOUND': return <XCircle className="w-4 h-4 text-rose-500" />;
      case 'ALL GOOD': return <CheckCircle className="w-4 h-4 text-green-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-orange-600" />;
    }
  };

  const formatDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const extractResourceContent = (resourceContentJson: string): string => {
    try {
      const parsed = JSON.parse(resourceContentJson);
      return parsed.resourceContent || resourceContentJson;
    } catch {
      return resourceContentJson;
    }
  };


  if (loading) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-[92vh]">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mx-auto mb-2"></div>
          Loading task details...
        </div>
      </div>
    );
  }

  if (error || !taskDetails) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-[92vh]">
        <div className="text-center text-red-500">
          <div className="mb-2">Error loading task details</div>
          <div className="text-sm">{error || 'No task details available'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 space-y-2 max-h-[92vh] overflow-y-auto
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Task Report</h1>
              <h1 className="text-xs text-gray-500 dark:text-gray-400">{taskDetails.task_id}</h1>
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Open Chat
            </Button>
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={handleViewPrompt}
            >
              <Eye className="w-4 h-4" />
              View Prompt
            </Button>
          </div>
        </div>

        <Card className="bg-transparent dark:bg-transparent border-gray-200/70 dark:border-gray-700/30">
          <CardContent className="py-6 px-0">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  {taskDetails.title}
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 truncate max-w-96">
                  {taskDetails.summary}
                </p>
                <div className="flex items-center gap-1 text-xs">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-600 dark:text-gray-400">{formatDate(taskDetails.created_at)}</span>
                  </div>
                  <Badge className={getSeverityColor('error')}>
                    {taskDetails.status.toUpperCase()}
                  </Badge>
                  <Badge className={getSeverityColor('warning')}>
                    {taskDetails.severity.toUpperCase()}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {taskDetails.tags?.map((tag: string, index: number) => (
                  <div key={index} className={`${getTagColor(tag)} font-medium px-1.5 py-0.5 rounded-md text-xs`}>
                    {tag}
                  </div>
                )) || (
                  <span className="text-xs text-gray-500">No tags</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Impact Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Card className="bg-transparent dark:bg-gray-800/20 h-36 border-gray-200/70 dark:border-gray-700/30 rounded-md">
          <CardContent className="p-4 h-full flex items-end">
            <div className="flex justify-between items-end w-full">
              <div className=''>
                <p className="text-4xl font-light text-gray-900 dark:text-gray-100">{taskDetails.impact?.error_rate ?? 0}%</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Error Rate</p>
              </div>
              <div className="p-2 rounded-lg w-fit bg-red-100 dark:bg-red-900/20">
                <TrendingUp className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-transparent dark:bg-gray-800/20 h-36 border-gray-200/70 dark:border-gray-700/30 rounded-md">
          <CardContent className="p-4 h-full flex items-end">
            <div className="flex justify-between items-end w-full">
              <div className=''>
                <p className="text-4xl font-light text-gray-900 dark:text-gray-100">{formatDuration(taskDetails.duration)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Task Duration</p>
              </div>
              <div className="p-2 rounded-lg w-fit bg-blue-100 dark:bg-blue-900/20">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>


        <Card className="bg-transparent dark:bg-gray-800/20 h-36 border-gray-200/70 dark:border-gray-700/30 rounded-md">
          <CardContent className="p-4 h-full flex items-end">
            <div className="flex justify-between items-end w-full">

              <div className=''>
                <p className="text-4xl font-light text-gray-900 dark:text-gray-100">{taskDetails.impact?.service_affected ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Services Affected</p>
              </div>
              <div className="p-2 rounded-lg w-fit bg-purple-100 dark:bg-purple-900/20">
                <Server className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">

        {/* Root Cause Analysis */}
        <Card className="bg-transparent dark:bg-gray-800/20 rounded-md border-gray-200/70 dark:border-gray-700/30 py-2">
          <CardContent className="space-y-4">
            <Accordion type="single" collapsible defaultValue="root-cause" className="w-full">
              <AccordionItem value="root-cause" className="border-0">
                <AccordionTrigger className="px-0 py-2 hover:no-underline">
                  <div className='flex items-center gap-2 text-purple-600 dark:text-blue-400'>
                    <SearchCode className="w-5 h-5" />
                    <h4 className="font-medium uppercase ">Root Cause Details</h4>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-2">
                  <div className="bg-gray-100 dark:bg-gray-800/20 border border-purple-200 dark:border-blue-800/60 rounded-lg p-4">
                    <p className="text-xs text-gray-700 dark:text-yellow-500">
                      <MarkdownContent content={taskDetails.summary || ''} />
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="space-y-2">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="remediation" className="border-0">
                  <AccordionTrigger className="px-0 py-2 hover:no-underline">
                    <div className='flex items-center justify-between w-full'>
                      <div className='flex items-center gap-2 text-green-600 dark:text-green-400'>
                        <Sparkles className="w-5 h-5" />
                        <h4 className="font-medium uppercase ">Suggested Remediation</h4>
                      </div>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              className="mr-2 h-6 text-xs flex justify-between w-36 items-center rounded cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Add resolve functionality here
                              }}
                            >
                              <div className='flex items-center gap-1'>
                                Resolve
                              </div>
                              <ArrowUpRight className="w-3 h-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="px-2 py-1">Ask Agentkube to Resolve</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-0 pb-2">
                    <div className="text-xs text-gray-600 dark:text-gray-400 px-2">
                      <MarkdownContent content={taskDetails.remediation || ''} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </CardContent>
        </Card>

        {/* System Checks */}
        <Card className="bg-transparent dark:bg-gray-800/20 rounded-md border-gray-200/70 dark:border-gray-700/30">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 uppercase text-sm">
              <ClipboardCheck className="w-5 h-5" />
              What We've Checked
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {taskDetails.sub_tasks && taskDetails.sub_tasks.length > 0 ? taskDetails.sub_tasks.map((subTask: SubTask, index: number) => {
              const status = getSubTaskStatus(subTask.status);
              const severity = getSubTaskSeverity(subTask.status);

              return (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-500/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500/10 transition-colors"
                  onClick={() => setSelectedSubTask(subTask)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {getStatusIcon(status)}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                          {subTask.subject || 'Unknown'}
                        </span>
                        <Badge className={getSeverityColor(severity)} >
                          {status}
                        </Badge>
                
                      </div>
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-72">
                          {subTask.goal || 'No goal specified'}
                        </p>
                    </div>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                </div>
              );
            }) : (
              <div className="text-center py-8">
                <ClipboardCheck className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No system checks available</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Checks will appear here when the task runs</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SubTask Details Drawer */}
      <SideDrawer
        isOpen={selectedSubTask !== null}
        onClose={() => setSelectedSubTask(null)}
        offsetTop="-top-2"
      >
        {selectedSubTask && (
          <>
            <DrawerHeader onClose={() => setSelectedSubTask(null)}>
              <div className="py-1">
                <div className='flex items-center space-x-2'>
                  <div className="p-2">
                    {getStatusIcon(getSubTaskStatus(selectedSubTask.status))}
                  </div>
                  <div className='flex items-center gap-1'>
                    <h3 className="font-medium text-sm text-gray-800 dark:text-gray-200 uppercase tracking-wide">
                      {selectedSubTask.reason}
                    </h3>
                    <Badge className={getSeverityColor(getSubTaskSeverity(selectedSubTask.status))} >
                      {getSubTaskStatus(selectedSubTask.status)}
                    </Badge>
                  </div>
                </div>
              </div>
            </DrawerHeader>

            <DrawerContent>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Goal</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedSubTask.goal}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-xs text-gray-900 dark:text-gray-500">Status</h4>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(getSubTaskStatus(selectedSubTask.status))}
                    <span className="text-xs">{getSubTaskStatus(selectedSubTask.status)}</span>
                    <span className="text-xs text-gray-500">({selectedSubTask.status} issues found)</span>
                  </div>
                </div>

                {selectedSubTask.plan && selectedSubTask.plan.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs uppercase font-medium text-gray-900 dark:text-gray-500">Plans</h4>
                    <Accordion type="single" collapsible className="w-full">
                      {selectedSubTask.plan.map((planItem, index) => (
                        <AccordionItem key={index} value={`plan-${index}`} className="border rounded-lg mb-2">
                          <AccordionTrigger className="px-3 py-2 hover:no-underline">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {planItem.tool_name}
                              </Badge>
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                {planItem.title}
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pb-3">
                            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-48 overflow-y-auto">
                              <MarkdownContent content={planItem.output || ''} />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}

                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Discovery</h4>
                  <div className="text-sm text-gray-600 dark:text-gray-400 max-h-64 overflow-y-auto">
                    <MarkdownContent content={selectedSubTask.discovery || ''} />
                  </div>
                </div>
              </div>
            </DrawerContent>
          </>
        )}
      </SideDrawer>

      {/* Prompt Details Drawer */}
      <SideDrawer
        isOpen={showPromptDrawer}
        onClose={() => setShowPromptDrawer(false)}
        offsetTop="-top-2"
      >
        <DrawerHeader onClose={() => setShowPromptDrawer(false)}>
          <div className="py-1">
            <div className='flex items-center space-x-2'>
              <div className='flex items-center gap-1'>
                <h3 className="font-[Anton] uppercase text-md text-gray-800 dark:text-gray-500/40 tracking-wide">
                  Investigation Prompt
                </h3>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerContent>
          <div className="p-6 space-y-4">
            {promptLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400"></div>
                <span className="ml-2 text-sm text-gray-500">Loading prompt details...</span>
              </div>
            ) : promptDetails ? (
              <>
                <div className="flex justify-between">
                  <div>
                    <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Task ID</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                      {promptDetails.task_id}
                    </p>
                  </div>

                  {promptDetails.model && (
                    <div className="">
                      <h4 className="font-medium text-right text-xs uppercase text-gray-900 dark:text-gray-500">Model</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                        {promptDetails.model}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Original Prompt</h4>
                    <div className="flex items-center gap-2">
                      {!isEditingPrompt && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          onClick={handleEditPrompt}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditingPrompt ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <textarea
                          value={editedPrompt}
                          onChange={(e) => setEditedPrompt(e.target.value)}
                          className="w-full h-32 p-3 text-sm border rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter your investigation prompt..."
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={handleSavePrompt}
                          className="h-7 px-3 text-xs"
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleCancelEdit}
                          className="h-7 px-3 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="relative">
                      <div className="bg-gray-800 dark:bg-gray-800/20 rounded-lg overflow-hidden border">
                        <button
                          onClick={() => handleCopy(promptDetails.prompt || '')}
                          className="absolute top-2 right-2 p-2 rounded-lg bg-neutral-700/20 dark:bg-gray-500/10 hover:bg-gray-600 text-gray-200/60 hover:text-white z-10"
                          aria-label="Copy prompt"
                        >
                          {copied ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <SyntaxHighlighter
                          language="text"
                          style={nord}
                          customStyle={customStyle}
                          wrapLines={true}
                          showLineNumbers={false}
                        >
                          {promptDetails.prompt || 'No prompt available'}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  )}
                </div>

                {promptDetails.context && (
                  <div className="space-y-2 border border-gray-200 dark:border-gray-800 rounded-lg">
                    <div className='bg-gray-200 dark:bg-gray-700/20 py-1.5 px-4'>
                      <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Context</h4>
                    </div>
                    <div className="py-2 px-3">
                      <div className="text-sm  space-y-2">
                        <div className='flex justify-between'>
                          <span className='dark:text-gray-500'>Cluster</span>
                          {promptDetails.context.kubecontext && (
                            <div className='flex items-center gap-1 text-gray-700 dark:text-gray-300'>
                              <span className="font-medium"><SiKubernetes className='h-4 w-4' /></span> {promptDetails.context.kubecontext}
                            </div>
                          )}
                        </div>
                        <div className='flex justify-between'>
                          <span className='dark:text-gray-500'>Namespace</span>
                          {promptDetails.context.namespace && (
                            <div className='text-gray-700 dark:text-gray-300 cursor-pointer text-blue-500 dark:hover:text-blue-400'>
                              {promptDetails.context.namespace}
                            </div>
                          )}
                        </div>


                      </div>
                    </div>
                  </div>
                )}



                {promptDetails.resource_context && promptDetails.resource_context.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Resource Context</h4>
                    <div className="space-y-2">
                      {promptDetails.resource_context.map((resource: ResourceContext, index) => (
                        <div key={index} className="bg-transparent rounded-lg border border-gray-200 dark:border-gray-800">
                          <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value={`resource-${index}`} className="border-0">
                              <AccordionTrigger className="px-2 py-2 hover:no-underline">
                                <div className="flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
                                  <SiKubernetes className='h-4 w-4' /> {resource.resource_name}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-2 pb-2">
                                <div className="relative">
                                  <button
                                    onClick={() => handleCopy(extractResourceContent(resource.resource_content))}
                                    className="absolute top-2 right-2 p-2 rounded-lg bg-neutral-700/20 dark:bg-gray-500/10 hover:bg-gray-600 text-gray-200/60 hover:text-white z-10"
                                    aria-label="Copy resource content"
                                  >
                                    {copied ? (
                                      <Check className="w-3 h-3" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                  <div className="max-h-48 overflow-y-auto         rounded-b-lg shadow-lg
                                    [&::-webkit-scrollbar]:w-1.5 
                                    [&::-webkit-scrollbar-track]:bg-transparent 
                                    [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                                    [&::-webkit-scrollbar-thumb]:rounded-full
                                    [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
                                    <SyntaxHighlighter
                                      language="yaml"
                                      style={nord}
                                      customStyle={customStyle}
                                      wrapLines={true}
                                      showLineNumbers={true}
                                      lineNumberStyle={{
                                        color: '#262625',
                                      }}
                                    >
                                      {extractResourceContent(resource.resource_content)}
                                    </SyntaxHighlighter>
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Always show Log Context section */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Log Context</h4>
                  {promptDetails.log_context && promptDetails.log_context.length > 0 ? (
                    <div className="space-y-2">
                      {promptDetails.log_context.map((log, index) => (
                        <div key={index} className="bg-transparent dark:bg-transparent rounded-lg border border-gray-200 dark:border-gray-800">
                          <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value={`log-${index}`} className="border-0">
                              <AccordionTrigger className="px-3 py-2 hover:no-underline">
                                <div className="flex items-center gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
                                  <Logs className='h-4 w-4' />  {log.log_name}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="px-3 pb-3">
                                <div className="relative">
                                  <button
                                    onClick={() => handleCopy(log.log_content)}
                                    className="absolute top-2 right-2 p-2 rounded-lg bg-neutral-700/80  hover:bg-gray-600 text-gray-200/60 hover:text-white z-10"
                                    aria-label="Copy log content"
                                  >
                                    {copied ? (
                                      <Check className="w-3 h-3" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                  <div className='max-h-48 overflow-y-auto rounded-b-lg shadow-lg
                                [&::-webkit-scrollbar]:w-1.5 
                                [&::-webkit-scrollbar-track]:bg-transparent 
                                [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                                [&::-webkit-scrollbar-thumb]:rounded-full
                                [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50'>
                                    <SyntaxHighlighter
                                      language="text"
                                      style={nord}
                                      customStyle={customStyle}
                                      wrapLines={true}
                                      showLineNumbers={false}
                                    >
                                      {log.log_content}
                                    </SyntaxHighlighter>
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-gray-200 dark:bg-transparent rounded-lg p-4 border border-gray-200 dark:border-gray-800">
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-700 dark:text-gray-300">No log context provided</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Log context will appear here if provided in the investigation request</p>
                      </div>
                    </div>
                  )}
                </div>

                {promptDetails.created_at && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Created</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(promptDetails.created_at)}
                    </p>
                  </div>
                )}

                {/* Re-Investigate Task Button */}
                {isPromptModified && (
                  <div className="pt-4">
                    <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                      Re-Investigate Task
                      <ArrowUpRight className="w-4 h-4 mr-2" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <Eye className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No prompt details available</p>
              </div>
            )}
          </div>
        </DrawerContent>
      </SideDrawer>

      {/* Events Timeline Section */}
      <Card className="bg-transparent border-gray-200/70 dark:border-gray-700/30">
        <CardHeader className="pb-4">
          <CardTitle className="text-xs flex items-center gap-2 text-yellow-800 dark:text-yellow-200 mb-2">
            <Calendar className="w-4 h-4" />
            Events
          </CardTitle>
          <Separator className='dark:bg-gray-400/10 h-[2px] rounded-full' />
        </CardHeader>
        <CardContent>
          {taskDetails.events && taskDetails.events.length > 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Events will be displayed here when available.
            </div>
          ) : (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No events recorded yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Events will appear here as they occur</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4">
        <div className="flex gap-3">

        </div>

        <div className="flex gap-3">
          <Button >
            Export Report
          </Button>
          <Button>
            Create Postmortem
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TaskReport;