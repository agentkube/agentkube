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
  TrendingUp,
  Server,
  Eye,
  MessageSquare,
  Calendar,
  Sparkles,
  ClipboardCheck,
  SearchCode,
  ArrowUpRight,
  Copy,
  Check,
  Wrench
} from 'lucide-react';
import MarkdownContent from '@/utils/markdown-formatter';
import { SideDrawer, DrawerHeader, DrawerContent } from "@/components/ui/sidedrawer.custom";
import { Separator } from '@/components/ui/separator';
import { getTaskDetails, getInvestigationTaskDetails } from '@/api/task';
import { TaskDetails, SubTask, InvestigationTaskDetails } from '@/types/task';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { nord } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CSSProperties } from 'react';
import TaskPromptDrawer from '@/components/custom/taskpromptdrawer/taskpromptdrawer.component';
import { FPGCanvas } from '@/components/custom/fpgcanvas/fpgcanvas.component';

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
  const { addStructuredContent } = useDrawer();
  const [taskDetails, setTaskDetails] = useState<TaskDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubTask, setSelectedSubTask] = useState<SubTask | null>(null);
  const [showPromptDrawer, setShowPromptDrawer] = useState(false);
  const [promptDetails, setPromptDetails] = useState<InvestigationTaskDetails | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
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


  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };


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


  const handleResolveClick = () => {
    if (!taskDetails) return;

    const structuredContent = `**${taskDetails.title}**\n

Severity: ${taskDetails.severity}
Status: ${taskDetails.status}

**Summary:**
${taskDetails.summary}

**Remediation:**
${taskDetails.remediation || 'No specific remediation provided'}

**Task ID:** ${taskDetails.task_id}
**Duration:** ${formatDuration(taskDetails.duration)}
**Services Affected:** ${taskDetails.impact?.service_affected ?? 0}
**Impacted Since:** ${taskDetails.impact?.impacted_since ?? 0}`;

    addStructuredContent(structuredContent, `Task: ${taskDetails.title.substring(0, 15)}...`);
    toast({
      title: "Added to Chat",
      description: 'Task details added to chat'
    });
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
            <Button
              onClick={(e) => {
                e.stopPropagation();
                handleResolveClick();
              }}
              className="flex items-center gap-2 w-36 flex justify-between">
              Open Chat
              <ArrowUpRight className="w-4 h-4" />
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Card className="bg-transparent dark:bg-gray-800/20 h-36 border-gray-200/70 dark:border-gray-700/30 rounded-md">
          <CardContent className="p-4 h-full flex items-end">
            <div className="flex justify-between items-end w-full">
              <div className=''>
                <p className="text-4xl font-light text-gray-900 dark:text-gray-100">{taskDetails.impact?.impacted_since ?? 0}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Impacted Since</p>
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

        <Card className="bg-transparent dark:bg-gray-800/20 h-36 border-gray-200/70 dark:border-gray-700/30 rounded-md">
          <CardContent className="p-4 h-full flex items-end">
            <div className="flex justify-between items-end w-full">
              <div className=''>
                <p className="text-4xl font-light text-gray-900 dark:text-gray-100">{taskDetails.pattern_confidence ? `${taskDetails.pattern_confidence}%` : '0%'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Pattern Confidence</p>
              </div>
              <div className="p-2 rounded-lg w-fit bg-orange-100 dark:bg-orange-900/20">
                <CheckCircle className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>


      {/* Fault Propagation Graph */}
      {taskDetails.fault_propagation_graph && taskDetails.fault_propagation_graph.nodes.length > 0 && (
        <Card className="bg-transparent dark:bg-gray-800/20 rounded-md border-gray-200/70 dark:border-gray-700/30">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 uppercase text-sm">
              <TrendingUp className="w-5 h-5" />
              Causal Dependency Graph
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <FPGCanvas
              faultPropagationGraph={taskDetails.fault_propagation_graph}
            />
          </CardContent>
        </Card>
      )}

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
                                handleResolveClick();
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
                  className=" gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-500/5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-500/10 transition-colors"
                  onClick={() => setSelectedSubTask(subTask)}
                >
                  <div className="flex justify-between items-center gap-2 min-w-0 flex-1">
                    <div className='flex items-center gap-1'>

                      {getStatusIcon(status)}

                      <Badge className={getSeverityColor(severity)} >
                        {status}
                      </Badge>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                  </div>
                  <div className="min-w-0 flex-1 mt-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 tracking-wide">
                        {subTask.subject || 'Unknown'}
                      </span>


                    </div>
                  </div>

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
                <div className='flex items-start space-x-2'>
                  <div className="py-0.5">
                    {getStatusIcon(getSubTaskStatus(selectedSubTask.status))}
                  </div>
                  <div className='flex items-center gap-0.5'>
                    <h3 className="font-medium text-md text-gray-800 dark:text-gray-200 leading-tight">
                      {selectedSubTask.reason}
                    </h3>

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
                    <h4 className="text-xs uppercase font-medium text-gray-900 dark:text-gray-500">Tool Calls Evidence</h4>
                    <div className="">
                      {selectedSubTask.plan.map((planItem, index) => (
                        <div key={index} className="border-x border-t last:border-b border-gray-400/20 dark:border-gray-800/50 rounded-none overflow-hidden">
                          <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value={`plan-${index}`} className="border-0">
                              <AccordionTrigger className="px-2 py-2 hover:no-underline bg-gray-200 dark:bg-transparent">
                                <div className="flex items-center gap-2">
                                  <Wrench className="h-4 w-4" />
                                  <span className="text-sm space-x-1 flex items-center">
                                    <span>{planItem.tool_name}</span>
                                  </span>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="bg-gray-100 dark:bg-transparent">
                                {/* Parameters section */}
                                {planItem.arguments && (
                                  <div className="p-2 space-y-1">
                                    <h4 className="text-xs uppercase text-gray-500 dark:text-gray-400">
                                      Parameters
                                    </h4>
                                    <div className="bg-gray-300/50 dark:bg-gray-800/50 rounded-md overflow-x-auto">
                                      <SyntaxHighlighter
                                        language="json"
                                        style={nord}
                                        customStyle={customStyle}
                                        wrapLines={true}
                                        showLineNumbers={false}
                                      >
                                        {JSON.stringify(JSON.parse(planItem.arguments), null, 2)}
                                      </SyntaxHighlighter>
                                    </div>
                                  </div>
                                )}

                                {/* Output section */}
                                {planItem.output && (
                                  <div className="p-2 pt-0 space-y-1">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-xs uppercase text-gray-500 dark:text-gray-400">
                                        Output
                                      </h4>
                                      <button
                                        onClick={() => handleCopy(planItem.output)}
                                        className="p-1 rounded hover:bg-gray-300/50 dark:hover:bg-gray-700/50 transition-colors"
                                        title="Copy output"
                                      >
                                        {copied ? (
                                          <Check className="h-3 w-3 text-green-500" />
                                        ) : (
                                          <Copy className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                                        )}
                                      </button>
                                    </div>
                                    <div className="bg-gray-300/50 dark:bg-gray-800/50 rounded-md overflow-x-auto">
                                      <SyntaxHighlighter
                                        language="bash"
                                        style={nord}
                                        customStyle={customStyle}
                                        wrapLines={true}
                                        showLineNumbers={false}
                                      >
                                        {planItem.output}
                                      </SyntaxHighlighter>
                                    </div>
                                  </div>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">Discovery</h4>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <MarkdownContent content={selectedSubTask.discovery || ''} />
                  </div>
                </div>
              </div>
            </DrawerContent>
          </>
        )}
      </SideDrawer>

      {/* Prompt Details Drawer */}
      <TaskPromptDrawer
        isOpen={showPromptDrawer}
        onClose={() => setShowPromptDrawer(false)}
        promptDetails={promptDetails}
        promptLoading={promptLoading}
      />

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
        </div>
      </div>
    </div>
  );
};

export default TaskReport;