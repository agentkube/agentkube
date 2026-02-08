import React, { useState, useEffect, useCallback, CSSProperties } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Calendar,
  Sparkles,
  ClipboardCheck,
  SearchCode,
  ArrowUpRight,
  Copy,
  Check,
  Loader2,
  Radio,
  Activity,
  Zap,
  Target,
  Trash2,
  StopCircle,
  CheckCircle2,
} from 'lucide-react';
import MarkdownContent from '@/utils/markdown-formatter';
import { formatTimeAgo } from '@/lib/utils';
import { SideDrawer, DrawerHeader, DrawerContent } from "@/components/ui/sidedrawer.custom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";
import InvestigationTodos from '@/components/investigationtodos/investigationtodos.component';
import TaskFeedback from '@/components/custom/taskfeedback/taskfeedback.component';
import { getInvestigationTaskDetails, cancelInvestigation, deleteInvestigation, patchTask } from '@/api/task';
import { InvestigationTaskDetails } from '@/types/task';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { nord } from "react-syntax-highlighter/dist/esm/styles/prism";
import TaskPromptDrawer from '@/components/custom/taskpromptdrawer/taskpromptdrawer.component';
import { FPGCanvas } from '@/components/custom/fpgcanvas/fpgcanvas.component';
import { useInvestigationStream, AnalysisStep, SubTaskState } from '@/hooks/useInvestigationStream';

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

// =============================================================================
// Sub Components
// =============================================================================

interface ToolCallItemProps {
  planItem: {
    tool_name: string;
    arguments: string;
    output?: string;
    call_id?: string;
  };
  index: number;
}

const ToolCallItem: React.FC<ToolCallItemProps> = ({ planItem, index }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent, content: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy content:', err);
    }
  };

  const customStyle: CSSProperties = {
    padding: '0.75rem',
    borderRadius: '0.5rem',
    background: 'transparent',
    fontSize: '0.75rem',
    margin: 0
  };

  const getArgString = (args: string) => {
    try {
      const parsed = JSON.parse(args);
      return JSON.stringify(parsed);
    } catch {
      return args;
    }
  };

  /**
   * Parse tool output - if it contains 'command' and 'output' keys,
   * return just the output. Handles both JSON and Python-style dict strings.
   */
  const parseToolOutput = (output: string): string => {
    if (!output) return '';

    try {
      // First try standard JSON parse
      const parsed = JSON.parse(output);
      if (parsed && typeof parsed === 'object' && 'command' in parsed && 'output' in parsed) {
        return parsed.output || '';
      }
      // If parsed but doesn't have command/output structure, return formatted JSON
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Try to handle Python-style dict string: {'key': 'value'}
      try {
        // Replace single quotes with double quotes for JSON compatibility
        // But be careful with quotes inside strings
        const pythonStyleMatch = output.match(/\{'command':\s*'([^']*)',\s*'output':\s*'(.*)'\}/s);
        if (pythonStyleMatch) {
          return pythonStyleMatch[2] || '';
        }

        // Alternative pattern with double quotes inside
        const altMatch = output.match(/\{'command':\s*"([^"]*)",\s*'output':\s*"(.*)"\}/s);
        if (altMatch) {
          return altMatch[2] || '';
        }

        // Try converting Python dict to JSON (basic conversion)
        const jsonified = output
          .replace(/'/g, '"')
          .replace(/True/g, 'true')
          .replace(/False/g, 'false')
          .replace(/None/g, 'null');

        const parsed = JSON.parse(jsonified);
        if (parsed && typeof parsed === 'object' && 'command' in parsed && 'output' in parsed) {
          return parsed.output || '';
        }
      } catch {
        // If all parsing fails, return original output
      }

      return output;
    }
  };

  return (
    <TimelineItem step={index + 1} className="pb-6 last:pb-0">
      <TimelineSeparator />
      <TimelineIndicator className="bg-muted-foreground/10 border-muted-foreground/80 p-0.5 mt-2">
        <div className="w-full h-full bg-muted-foreground rounded-full shadow-[0_0_8px_0_rgba(var(--muted-foreground),0.5)]" />
      </TimelineIndicator>

      <TimelineHeader className="mb-2">
        <TimelineTitle className="text-sm font-medium text-foreground/70">
          {planItem.tool_name}
        </TimelineTitle>
      </TimelineHeader>

      <TimelineContent>
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="group relative rounded-lg border border-border/50 bg-muted/30 hover:bg-muted/50 transition-all cursor-pointer overflow-hidden"
        >
          <div className="flex items-start justify-between p-3 gap-3">
            <div className={`font-mono text-xs text-muted-foreground w-full ${!isExpanded ? 'truncate' : ''}`}>
              {isExpanded ? (
                <div className="space-y-4 overflow-x-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                  <div>
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 mb-1 block">Arguments</span>
                    <SyntaxHighlighter
                      language="json"
                      style={nord}
                      customStyle={{ ...customStyle, background: 'rgba(0,0,0,0.2)' }}
                      wrapLines={true}
                      showLineNumbers={false}
                    >
                      {JSON.stringify(JSON.parse(planItem.arguments), null, 2)}
                    </SyntaxHighlighter>
                  </div>

                  {planItem.output && (
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 mb-1 block">Output</span>
                      <SyntaxHighlighter
                        language="bash"
                        style={nord}
                        customStyle={{ ...customStyle, background: 'rgba(0,0,0,0.2)' }}
                        wrapLines={true}
                        showLineNumbers={false}
                      >
                        {parseToolOutput(planItem.output)}
                      </SyntaxHighlighter>
                    </div>
                  )}
                </div>
              ) : (
                <span className="opacity-80">
                  {getArgString(planItem.arguments)}
                </span>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={(e) => handleCopy(e, isExpanded ? (planItem.output ? parseToolOutput(planItem.output) : planItem.arguments) : planItem.arguments)}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </TimelineContent>
    </TimelineItem>
  );
};

/**
 * Streaming step item for the analysis timeline
 */
const StreamingStepItem: React.FC<{
  step: AnalysisStep;
  index: number;
  isLatest: boolean;
}> = ({ step, index, isLatest }) => {
  const getStatusColor = () => {
    switch (step.status) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-blue-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-muted-foreground/50';
    }
  };

  return (
    <TimelineItem
      step={index + 1}
      className="pb-4 last:pb-0"
      animate={isLatest}
      isActive={isLatest}
    >
      <TimelineSeparator
        className={isLatest ? 'bg-blue-500/50' : 'bg-muted-foreground/20'}
        animate={isLatest}
      />
      <TimelineIndicator
        className={`${isLatest ? 'border-blue-500' : 'border-muted-foreground/50'} p-0.5 mt-1`}
        pulse={isLatest}
      >
        <div className={`w-full h-full ${getStatusColor()} rounded-full transition-all duration-300`} />
      </TimelineIndicator>
      <div className="flex flex-col gap-0.5">
        <TimelineTitle className={`text-xs font-medium ${isLatest ? 'text-foreground' : 'text-muted-foreground'} leading-none transition-colors duration-300`}>
          {step.title}
        </TimelineTitle>
        {step.detail && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 transition-opacity duration-300">
            {step.detail}
          </p>
        )}
      </div>
    </TimelineItem>
  );
};

/**
 * Streaming SubTask card
 */
const StreamingSubTaskCard: React.FC<{
  subTask: SubTaskState;
  onClick: () => void;
}> = ({ subTask, onClick }) => {
  const status = subTask.status === 0 ? 'ALL GOOD' : 'ISSUES FOUND';
  const statusColor = subTask.status === 0
    ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';

  return (
    <div
      className="gap-3 p-2 rounded-lg bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex justify-between items-center gap-2 min-w-0 flex-1">
        <div className='flex items-center gap-1'>
          {subTask.status === 0
            ? <CheckCircle className="w-4 h-4 text-green-600" />
            : <XCircle className="w-4 h-4 text-rose-500" />
          }
          <Badge className={statusColor}>
            {status}
          </Badge>
        </div>
        <ArrowUpRight className="w-4 h-4 text-muted-foreground mt-1 flex-shrink-0" />
      </div>
      <div className="min-w-0 flex-1 mt-2">
        <span className="text-xs font-medium text-muted-foreground tracking-wide">
          {subTask.subject || 'Unknown'}
        </span>
      </div>
    </div>
  );
};

/**
 * Streaming metrics cards that update in real-time
 */
const StreamingMetricsGrid: React.FC<{
  duration: number | null;
  patternConfidence: number | null;
  impact: { duration: number; services_affected: number; impacted_since: number } | null;
  isStreaming: boolean;
}> = ({ duration, patternConfidence, impact, isStreaming }) => {
  const formatDuration = (totalSeconds: number | null): string => {
    if (totalSeconds === null) return isStreaming ? '...' : '0s';
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
      <Card className="bg-card/30 h-36 border-border/50 rounded-md">
        <CardContent className="p-4 h-full flex items-end">
          <div className="flex justify-between items-end w-full">
            <div>
              <p className="text-4xl font-light text-foreground">
                {impact?.impacted_since ? formatTimeAgo(impact.impacted_since) : (isStreaming ? '...' : 'N/A')}
              </p>
              <p className="text-xs text-muted-foreground">Impacted Since</p>
            </div>
            <div className="p-2 rounded-lg w-fit bg-red-100 dark:bg-red-900/20">
              <TrendingUp className="w-5 h-5 text-red-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/30 h-36 border-border/50 rounded-md">
        <CardContent className="p-4 h-full flex items-end">
          <div className="flex justify-between items-end w-full">
            <div>
              <p className="text-4xl font-light text-foreground">
                {formatDuration(duration)}
              </p>
              <p className="text-xs text-muted-foreground">Task Duration</p>
            </div>
            <div className="p-2 rounded-lg w-fit bg-blue-100 dark:bg-blue-900/20">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/30 h-36 border-border/50 rounded-md">
        <CardContent className="p-4 h-full flex items-end">
          <div className="flex justify-between items-end w-full">
            <div>
              <p className="text-4xl font-light text-foreground">
                {impact?.services_affected ?? (isStreaming ? '...' : 0)}
              </p>
              <p className="text-xs text-muted-foreground">Services Affected</p>
            </div>
            <div className="p-2 rounded-lg w-fit bg-purple-100 dark:bg-purple-900/20">
              <Server className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/30 h-36 border-border/50 rounded-md">
        <CardContent className="p-4 h-full flex items-end">
          <div className="flex justify-between items-end w-full">
            <div>
              <p className="text-4xl font-light text-foreground">
                {patternConfidence !== null ? `${patternConfidence}%` : (isStreaming ? '...' : '0%')}
              </p>
              <p className="text-xs text-muted-foreground">Pattern Confidence</p>
            </div>
            <div className="p-2 rounded-lg w-fit bg-orange-100 dark:bg-orange-900/20">
              <Target className="w-5 h-5 text-orange-600" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

/**
 * Streaming status indicator
 */
const StreamingStatus: React.FC<{
  status: 'idle' | 'loading' | 'connecting' | 'streaming' | 'completed' | 'error';
  eventsCount: number;
}> = ({ status, eventsCount }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'loading':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: 'Loading...',
          color: 'text-blue-500'
        };
      case 'connecting':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: 'Connecting...',
          color: 'text-yellow-500'
        };
      case 'streaming':
        return {
          icon: <Loader2 className="w-4 h-4 animate-spin" />,
          text: 'Progressing',
          color: 'text-foreground'
        };
      case 'completed':
        return {
          icon: <CheckCircle className="w-4 h-4" />,
          text: 'Completed',
          color: 'text-blue-500'
        };
      case 'error':
        return {
          icon: <XCircle className="w-4 h-4" />,
          text: 'Error',
          color: 'text-red-500'
        };
      default:
        return {
          icon: <Activity className="w-4 h-4" />,
          text: 'Ready',
          color: 'text-muted-foreground'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`flex items-center gap-2 ${config.color}`}>
      {config.icon}
      <span className="text-xs font-medium">{config.text}</span>
    </div>
  );
};

// =============================================================================
// Main Task Report Component (SSE Streaming)
// =============================================================================

const TaskReport: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { addStructuredContent } = useDrawer();
  const [selectedSubTask, setSelectedSubTask] = useState<SubTaskState | null>(null);
  const [isGraphExpanded, setIsGraphExpanded] = useState(false);
  const [showPromptDrawer, setShowPromptDrawer] = useState(false);
  const [promptDetails, setPromptDetails] = useState<InvestigationTaskDetails | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Resolved state
  const [isResolved, setIsResolved] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // SSE Streaming hook
  const {
    state,
    subscribeToTask,
    cancel,
    generateTitle,
    isStreaming,
    isCompleted,
    isError,
    isTitleStreaming,
  } = useInvestigationStream();

  // Subscribe to task events when component mounts or taskId changes
  useEffect(() => {
    if (taskId && state.taskId !== taskId) {
      subscribeToTask(taskId);
    }

    return () => {
      cancel();
    };
  }, [taskId, state.taskId, subscribeToTask, cancel]);

  // Track if we've already attempted title generation for this task
  const titleGenerationAttemptedRef = React.useRef<string | null>(null);

  // Trigger title generation when investigation completes with summary
  useEffect(() => {
    // Skip if:
    // - Investigation not complete
    // - No summary available (root cause needed for title generation)
    // - Title is currently being generated
    // - We already attempted for this task
    if (
      !isCompleted ||
      !state.summary ||
      isTitleStreaming ||
      titleGenerationAttemptedRef.current === taskId
    ) {
      return;
    }

    // Check if title needs generation:
    // - No title at all
    // - Title is same as user prompt (not properly generated)
    // - Title is a default/placeholder
    const userPrompt = promptDetails?.prompt || '';
    const needsTitleGeneration =
      !state.title ||
      state.title === userPrompt ||
      state.title === 'New Investigation' ||
      state.title.length < 10; // Too short to be descriptive

    if (needsTitleGeneration) {
      console.log('[TitleGen] Triggering title generation for task:', taskId);
      titleGenerationAttemptedRef.current = taskId || null;
      generateTitle(promptDetails?.prompt || 'Kubernetes investigation');
    }
  }, [isCompleted, state.summary, state.title, isTitleStreaming, promptDetails, generateTitle, taskId]);

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

  // Eagerly fetch prompt details when streaming starts (for title generation)
  useEffect(() => {
    if (isStreaming && taskId && !promptDetails && !promptLoading) {
      fetchPromptDetails();
    }
  }, [isStreaming, taskId, promptDetails, promptLoading, fetchPromptDetails]);

  // Sync resolved status from stream state
  useEffect(() => {
    if (state.resolved !== undefined) {
      setIsResolved(state.resolved === "yes");
    }
  }, [state.resolved]);

  const handleViewPrompt = () => {
    setShowPromptDrawer(true);
    if (!promptDetails) {
      fetchPromptDetails();
    }
  };

  const handleStopInvestigation = async () => {
    if (!taskId) return;

    setIsStopping(true);
    try {
      await cancelInvestigation(taskId);
      toast({
        title: "Investigation Stopped",
        description: "The investigation has been stopped successfully."
      });
      // Cancel local stream
      cancel();
    } catch (error) {
      console.error('Error stopping investigation:', error);
      toast({
        title: "Error",
        description: "Failed to stop investigation. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsStopping(false);
    }
  };

  const handleDeleteInvestigation = async () => {
    if (!taskId) return;

    setIsDeleting(true);
    try {
      await deleteInvestigation(taskId);
      toast({
        title: "Investigation Deleted",
        description: "The investigation has been deleted successfully."
      });
      // Navigate back to investigations page
      navigate('/dashboard/investigations');
    } catch (error) {
      console.error('Error deleting investigation:', error);
      toast({
        title: "Error",
        description: "Failed to delete investigation. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleToggleResolved = async () => {
    if (!taskId) return;

    setIsResolving(true);
    try {
      const newResolvedStatus = isResolved ? "no" : "yes"; // Toggle
      await patchTask(taskId, newResolvedStatus);
      setIsResolved(newResolvedStatus === "yes");
      toast({
        title: newResolvedStatus === "yes" ? "Marked as Resolved" : "Marked as Unresolved",
        description: newResolvedStatus === "yes"
          ? "This investigation has been marked as resolved."
          : "This investigation has been marked as unresolved."
      });
    } catch (error) {
      console.error('Error updating task:', error);
      toast({
        title: "Error",
        description: "Failed to update task status. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsResolving(false);
    }
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

  const formatDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  const handleResolveClick = () => {
    if (!state.summary) return;

    const structuredContent = `**${state.title || 'Investigation Report'}**

Severity: ${state.patternConfidence ? 'High' : 'Unknown'}
Status: ${state.status}

**Summary:**
${state.summary}

**Remediation:**
${state.remediation || 'No specific remediation provided'}

**Task ID:** ${taskId}
**Duration:** ${formatDuration(state.duration || 0)}
**Services Affected:** ${state.impact?.services_affected ?? 0}
**Impacted Since:** ${state.impact?.impacted_since ? formatTimeAgo(state.impact.impacted_since) : 'Unknown'}`;

    addStructuredContent(structuredContent, `Task: ${(state.title || 'Investigation').substring(0, 15)}...`);
    toast({
      title: "Added to Chat",
      description: 'Task details added to chat'
    });
  };

  // Loading state (fetching task data via REST)
  if (state.status === 'loading') {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-[92vh]">
        <div className="text-center text-muted-foreground">
          <Loader2 className="animate-spin h-8 w-8 mx-auto mb-2" />
          Loading investigation...
        </div>
      </div>
    );
  }

  // Connecting state (connecting to SSE for live updates)
  // Only show full-screen loading if we have no data yet
  // If we have data from REST API, continue to show the main UI with a "connecting" status indicator
  if (state.status === 'connecting' && !state.title && state.events.length === 0) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-[92vh]">
        <div className="text-center text-muted-foreground">
          <Loader2 className="animate-spin h-8 w-8 mx-auto mb-2" />
          Connecting to live stream...
        </div>
      </div>
    );
  }

  // Error state with no data
  if (isError && state.events.length === 0 && !state.summary && !state.title) {
    return (
      <div className="px-6 py-6 flex items-center justify-center h-[92vh]">
        <div className="text-center text-red-500">
          <XCircle className="h-8 w-8 mx-auto mb-2" />
          <div className="mb-2">Error loading investigation</div>
          <div className="text-sm">{state.error || 'Unknown error'}</div>
        </div>
      </div>
    );
  }

  // Show last 6 steps by default, or all if expanded
  const visibleSteps = isGraphExpanded
    ? state.analysisSteps
    : state.analysisSteps.slice(-6);

  return (
    <div className="px-6 py-6 space-y-2 max-h-[92vh] overflow-y-auto
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/50">

      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-5xl text-foreground/40 font-[Anton] uppercase font-bold">
                Task Report
              </h1>
              <h1 className="text-xs text-muted-foreground">{taskId}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <StreamingStatus status={state.status} eventsCount={state.events.length} />
            <div className="flex gap-2">
              {(state.summary || state.remediation) && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResolveClick();
                  }}
                  className="flex items-center gap-2 w-36 justify-between"
                >
                  Open Chat
                  <ArrowUpRight className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="outline"
                className="flex items-center gap-2"
                onClick={handleViewPrompt}
              >
                <Eye className="w-4 h-4" />
                View Prompt
              </Button>
              {/* Stop button - only show when streaming */}
              {isStreaming && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/20"
                        onClick={handleStopInvestigation}
                        disabled={isStopping}
                      >
                        <StopCircle className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isStopping ? 'Stopping...' : 'Stop Investigation'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Delete button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-600 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/20"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={isDeleting}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete Investigation</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Mark as Resolved button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`hover:bg-green-100 dark:hover:bg-green-900/20 ${isResolved
                        ? 'text-green-600 hover:text-green-700'
                        : 'text-gray-400 hover:text-green-600'
                        }`}
                      onClick={handleToggleResolved}
                      disabled={isResolving}
                    >
                      <CheckCircle2 className={`w-4 h-4 ${isResolved ? 'fill-current' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isResolved ? 'Mark as Unresolved' : 'Mark as Resolved'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>

        <Card className="bg-transparent border-none">
          <CardContent className="py-6 px-0">
            <div className="mb-4">
              <h2 className="text-lg font-medium text-foreground mb-2 flex items-center gap-0">
                {/* Show streaming title with cursor effect, or final title, or default */}
                {isTitleStreaming ? (
                  <>
                    <span
                      className="inline-block"
                      style={{
                        background: 'linear-gradient(90deg, hsl(var(--foreground)) 0%, hsl(var(--primary)) 50%, hsl(var(--foreground)) 100%)',
                        backgroundSize: '200% 100%',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        animation: 'shimmer 2s ease-in-out infinite',
                      }}
                    >
                      {state.streamingTitle}
                    </span>
                    <span
                      className="inline-block w-[2px] h-5 ml-0.5 rounded-full"
                      style={{
                        background: 'hsl(var(--primary))',
                        animation: 'cursorBlink 0.8s ease-in-out infinite',
                        boxShadow: '0 0 8px hsl(var(--primary) / 0.5)',
                      }}
                    />
                    <style>{`
                      @keyframes shimmer {
                        0%, 100% { background-position: 200% 0; }
                        50% { background-position: 0% 0; }
                      }
                      @keyframes cursorBlink {
                        0%, 100% { opacity: 1; transform: scaleY(1); }
                        50% { opacity: 0.3; transform: scaleY(0.8); }
                      }
                    `}</style>
                  </>
                ) : (
                  state.title || (isCompleted ? 'New Investigation' : 'Investigation in Progress...')
                )}
              </h2>
              <p className="text-xs text-muted-foreground mb-4 truncate max-w-96">
                {state.summary || (isStreaming ? 'Analyzing...' : 'Waiting for results...')}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs">
                  <Badge className={
                    isStreaming
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300'
                      : isCompleted
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                        : isError
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                          : 'bg-muted text-muted-foreground'
                  }>
                    {state.status.toUpperCase()}
                  </Badge>
                  {state.matchedPattern && (
                    <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
                      {state.matchedPattern}
                    </Badge>
                  )}
                </div>
                <TaskFeedback
                  taskId={taskId || ''}
                  summary={state.summary}
                  remediation={state.remediation}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Streaming Metrics */}
      <StreamingMetricsGrid
        duration={state.duration}
        patternConfidence={state.patternConfidence}
        impact={state.impact}
        isStreaming={isStreaming}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">

        <Card className="bg-card/30 rounded-md border-border/50 py-2">
          <CardContent className="space-y-4">
            <div className="py-2 mb-2">
              <div className="flex items-center justify-between mb-2 px-1">
                <h4 className="font-bold text-sm">
                  Tasks
                </h4>
              </div>

              {state.analysisSteps.length > 6 && (
                <div
                  className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 cursor-pointer mb-3 hover:text-foreground transition-colors px-1"
                  onClick={() => setIsGraphExpanded(!isGraphExpanded)}
                >
                  {isGraphExpanded ? "Collapse" : `${state.analysisSteps.length - 6} previous tasks`}
                </div>
              )}

              {state.analysisSteps.length > 0 ? (
                <Timeline>
                  {visibleSteps.map((step, index) => (
                    <StreamingStepItem
                      key={`${step.timestamp}-${index}`}
                      step={step}
                      index={isGraphExpanded ? index : Math.max(0, state.analysisSteps.length - 6) + index}
                      isLatest={index === visibleSteps.length - 1 && isStreaming}
                    />
                  ))}
                </Timeline>
              ) : (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {isStreaming ? 'Waiting for events...' : 'No analysis steps yet'}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-2">
          {/* Investigation Todos */}
          <InvestigationTodos todos={state.todos} isStreaming={isStreaming} />

          {/* System Checks / SubTasks */}
          <Card className="bg-card/30 rounded-md border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 uppercase text-sm">
                <ClipboardCheck className="w-5 h-5" />
                What We've Checked
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {state.subTasks.length > 0 ? (
                state.subTasks.map((subTask, index) => (
                  <StreamingSubTaskCard
                    key={`${subTask.subject}-${index}`}
                    subTask={subTask}
                    onClick={() => setSelectedSubTask(subTask)}
                  />
                ))
              ) : (
                <div className="text-center py-8">
                  <ClipboardCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {isStreaming ? 'Checks will appear as agents complete...' : 'No system checks available'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Summary & Remediation (shown when available) */}
      {(state.summary || state.remediation) && (
        <Card className="bg-card/30 rounded-md border-border/50 py-2 mt-2">
          <CardContent className="space-y-4">
            {state.summary && (
              <Accordion type="single" collapsible defaultValue="root-cause" className="w-full">
                <AccordionItem value="root-cause" className="border-0">
                  <AccordionTrigger className="px-0 py-2 hover:no-underline">
                    <div className='flex items-center gap-2 text-purple-600 dark:text-blue-400'>
                      <SearchCode className="w-5 h-5" />
                      <h4 className="font-medium uppercase">Root Cause Details</h4>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-0 pb-2">
                    <div className="bg-muted/50 rounded-lg p-4">
                      <div className="text-xs text-foreground">
                        <MarkdownContent content={state.summary} />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {state.remediation && (
              <Accordion type="single" collapsible defaultValue="remediation" className="w-full">
                <AccordionItem value="remediation" className="border-0">
                  <AccordionTrigger className="px-0 py-2 hover:no-underline">
                    <div className='flex items-center justify-between w-full'>
                      <div className='flex items-center gap-2 text-green-600 dark:text-green-400'>
                        <Sparkles className="w-5 h-5" />
                        <h4 className="font-medium uppercase">Suggested Remediation</h4>
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
                    <div className="text-xs text-muted-foreground px-2">
                      <MarkdownContent content={state.remediation} />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </CardContent>
        </Card>
      )}

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
                    {selectedSubTask.status === 0
                      ? <CheckCircle className="w-4 h-4 text-green-600" />
                      : <XCircle className="w-4 h-4 text-rose-500" />
                    }
                  </div>
                  <div className='flex items-center gap-0.5'>
                    <h3 className="font-medium text-md text-foreground leading-tight">
                      {selectedSubTask.reason}
                    </h3>
                  </div>
                </div>
              </div>
            </DrawerHeader>

            <DrawerContent>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-muted-foreground">Goal</h4>
                  <p className="text-sm text-foreground/80">
                    {selectedSubTask.goal}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-muted-foreground">Status</h4>
                  <div className="flex items-center gap-2">
                    {selectedSubTask.status === 0
                      ? <CheckCircle className="w-4 h-4 text-green-600" />
                      : <XCircle className="w-4 h-4 text-rose-500" />
                    }
                    <span className="text-xs">
                      {selectedSubTask.status === 0 ? 'ALL GOOD' : 'ISSUES FOUND'}
                    </span>
                    <span className="text-xs text-muted-foreground">({selectedSubTask.status} issues found)</span>
                  </div>
                </div>

                {selectedSubTask.plan && selectedSubTask.plan.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs uppercase font-medium text-muted-foreground">Evidence</h4>
                    <div className="pl-2">
                      <Timeline defaultValue={selectedSubTask.plan.length}>
                        {selectedSubTask.plan.map((planItem, index) => (
                          <ToolCallItem key={index} planItem={planItem} index={index} />
                        ))}
                      </Timeline>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-medium text-xs uppercase text-muted-foreground">Discovery</h4>
                  <div className="text-sm text-foreground/80">
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md dark:bg-card/40 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>Delete Investigation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this investigation?
              <br /><br />
              This action cannot be undone and will remove the task and all its associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteInvestigation}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Investigation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4">
        <div className="flex gap-3">
        </div>

        <div className="flex gap-3">
          <Button>
            Export Report
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TaskReport;