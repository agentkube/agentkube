import { useState, useCallback, useRef, useEffect } from 'react';
import {
  InlineStreamEvent,
  startInlineInvestigation,
  subscribeToTaskEvents,
  getTaskDetails,
  streamTitleGeneration,
} from '@/api/task';
import { InvestigationRequest, TaskDetails } from '@/types/task';
import { notify } from '@/services/notification.service';

// =============================================================================
// Investigation Stream State Types
// =============================================================================

export interface AnalysisStep {
  title: string;
  detail: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  timestamp: string;
  tool_name?: string;
  arguments?: string;
}

export interface SubTaskState {
  subject: string;
  status: number;
  reason: string;
  goal: string;
  plan: Array<{
    tool_name: string;
    arguments: string;
    output?: string;
    call_id?: string;
  }>;
  discovery: string;
  agent_type?: string;
  timestamp?: string;
}

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high';
  assigned_to?: string;
  timestamp: string;
}

export interface InvestigationStreamState {
  taskId: string | null;
  status: 'idle' | 'loading' | 'connecting' | 'streaming' | 'completed' | 'error';
  title: string | null;
  streamingTitle: string; // Title being streamed token-by-token
  isTitleStreaming: boolean; // Whether title is currently being generated
  // Events & Steps
  events: InlineStreamEvent[];
  analysisSteps: AnalysisStep[];
  subTasks: SubTaskState[];
  planSteps: string[];
  todos: TodoItem[];
  resolved: string; // "yes" or "no"
  // Metrics
  patternConfidence: number | null;
  matchedPattern: string | null;
  impact: {
    duration: number;
    services_affected: number;
    impacted_since: number;
    severity?: string;
    affected_resources?: string[];
  } | null;
  summary: string | null;
  remediation: string | null;
  duration: number | null;
  // Prompt details
  userPrompt: string | null;
  // Error message
  error: string | null;
}

const initialState: InvestigationStreamState = {
  taskId: null,
  status: 'idle',
  title: null,
  streamingTitle: 'New Investigation',
  isTitleStreaming: false,
  events: [],
  analysisSteps: [],
  subTasks: [],
  planSteps: [],
  todos: [],
  resolved: "no", // Default to unresolved
  patternConfidence: null,
  matchedPattern: null,
  impact: null,
  summary: null,
  remediation: null,
  duration: null,
  userPrompt: null,
  error: null,
};


// =============================================================================
// Helper: Parse event to meaningful step title and detail
// =============================================================================

function parseEventToStep(e: any, fallbackTimestamp: string): AnalysisStep | null {
  const timestamp = e.timestamp || fallbackTimestamp;
  
  switch (e.type) {
    case 'investigation_started':
      return {
        title: 'Investigation Started',
        detail: e.title || `Task ID: ${e.task_id || 'unknown'}`,
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'tool_call':
      // Parse create_todo to show actual content
      if (e.tool_name === 'create_todo' && e.arguments) {
        try {
          const args = JSON.parse(e.arguments);
          return {
            title: `Todo: ${args.content?.substring(0, 50) || 'New task'}`,
            detail: `Priority: ${args.priority || 'medium'}${args.assigned_to ? `, Assigned: ${args.assigned_to}` : ''}`,
            status: 'completed',
            timestamp,
            tool_name: e.tool_name,
            arguments: e.arguments,
          };
        } catch {
          return null; // Skip malformed create_todo
        }
      }
      // Other tool calls - use title from backend if available
      let toolDetail = '';
      try {
        toolDetail = e.arguments ? (JSON.parse(e.arguments).content || '') : '';
      } catch {
        toolDetail = '';
      }
      return {
        title: e.title || `Tool: ${e.tool_name || 'unknown'}`,
        detail: toolDetail,
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'analysis_step':
      return {
        title: e.title || e.tool_name || 'Analysis',
        detail: e.detail || '',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'agent_phase_complete':
      const agentType = e.sub_task?._agent_type || e.agent_type || 'agent';
      // Map agent types to human-readable completion titles
      const completionTitles: Record<string, string> = {
        'logging': 'Log Investigation Complete',
        'discovery': 'Resource Discovery Complete',
        'monitoring': 'Metrics Analysis Complete',
        'agent': 'Investigation Phase Complete'
      };
      const completionTitle = completionTitles[agentType] || `${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Complete`;
      return {
        title: completionTitle,
        detail: e.sub_task?.subject || e.sub_task?.reason || 'Phase completed',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'investigation_plan':
      const planLength = e.plan?.length || e.plan_steps?.length || 0;
      return {
        title: 'Investigation Plan Created',
        detail: `${planLength} steps planned`,
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'pattern_confidence':
      return {
        title: `Pattern Matched: ${e.matched_pattern || 'Unknown'}`,
        detail: `Confidence: ${e.confidence}%`,
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'impact_analysis':
      return {
        title: 'Impact Analysis Complete',
        detail: e.impact 
          ? `${e.impact.service_affected} service(s) affected, impacted for ${e.impact.impact_duration}s`
          : 'Impact assessed',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'task_duration':
      return {
        title: 'Duration Recorded',
        detail: `Investigation took ${e.duration}s`,
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'investigation_draft':
      return {
        title: 'Draft Analysis Generated',
        detail: 'Initial findings ready for review',
        status: 'in_progress',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'critique_started':
      return {
        title: 'Quality Review Started',
        detail: 'Reviewing analysis for accuracy and completeness',
        status: 'in_progress',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'critique_complete':
      return {
        title: e.approved ? 'Quality Review Passed' : 'Refinement Needed',
        detail: e.critique_summary || 'Review complete',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'refinement_started':
      return {
        title: 'Refining Analysis',
        detail: 'Improving based on review feedback',
        status: 'in_progress',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'refinement_complete':
      return {
        title: 'Analysis Refined',
        detail: 'Improvements applied successfully',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'investigation_summary':
      return {
        title: e.is_draft ? 'Draft Summary' : 'Final Summary Generated',
        detail: e.summary?.substring(0, 100) + (e.summary?.length > 100 ? '...' : '') || 'Summary available',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'investigation_remediation':
      return {
        title: 'Remediation Suggested',
        detail: 'Remediation steps are now available',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'confidence_started':
      return {
        title: 'Calculating Confidence',
        detail: 'Assessing investigation quality and impact',
        status: 'in_progress',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'confidence_complete':
      return {
        title: `Confidence: ${e.confidence}%`,
        detail: e.matched_pattern 
          ? `Pattern: ${e.matched_pattern} | ${e.services_affected} service(s) affected` 
          : `${e.services_affected} service(s) affected | ${e.impact_severity} severity`,
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'investigation_complete':
      return {
        title: 'Investigation Complete',
        detail: 'All analysis phases finished',
        status: 'completed',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    case 'error':
      return {
        title: 'Error',
        detail: e.error || 'Unknown error occurred',
        status: 'error',
        timestamp,
        tool_name: e.tool_name,
        arguments: e.arguments,
      };
      
    default:
      // Skip unknown events or return generic step
      if (e.type) {
        return {
          title: e.type,
          detail: e.detail || '',
          status: 'completed',
          timestamp,
          tool_name: e.tool_name,
          arguments: e.arguments,
        };
      }
      return null;
  }
}

// =============================================================================
// Helper: Convert TaskDetails from REST to InvestigationStreamState
// =============================================================================

function taskDetailsToState(task: TaskDetails, taskId: string): Partial<InvestigationStreamState> {
  // Convert sub_tasks to SubTaskState array
  const subTasks: SubTaskState[] = (task.sub_tasks || []).map(st => ({
    subject: st.subject,
    status: st.status,
    reason: st.reason,
    goal: st.goal,
    plan: st.plan || [],
    discovery: st.discovery,
  }));

  // Convert events to AnalysisStep array with proper parsing
  const analysisSteps: AnalysisStep[] = (task.events || [])
    .map((e: any) => parseEventToStep(e, task.created_at))
    .filter((step): step is AnalysisStep => step !== null);

  // Extract todos from create_todo events
  const todos: TodoItem[] = [];
  (task.events || [])
    .filter((e: any) => e.type === 'tool_call' && e.tool_name === 'create_todo' && e.arguments)
    .forEach((e: any, idx: number) => {
      try {
        const args = JSON.parse(e.arguments);
        todos.push({
          id: `todo-${idx}`,
          content: args.content || 'Unknown task',
          status: task.status === 'completed' ? 'completed' : 'in_progress',
          priority: args.priority || 'medium',
          assigned_to: args.assigned_to,
          timestamp: e.timestamp || task.created_at,
        });
      } catch {
        // Skip malformed todo events
      }
    });

  // Extract confidence data from confidence_complete event (fallback for when impact object is incomplete)
  const confidenceEvent = (task.events || []).find((e: any) => e.type === 'confidence_complete');
  const servicesAffectedFromEvent = confidenceEvent?.services_affected ?? 0;
  const impactedSinceFromEvent = confidenceEvent?.impacted_since;

  // Determine status based on task status
  // Note: 'processed' means still processing (in progress), 'completed' means finished
  const isCompleted = task.status === 'completed';
  const status: InvestigationStreamState['status'] = 
    task.status === 'cancelled' ? 'error' :
    isCompleted ? 'completed' : 'streaming';

  // Build impact object, preferring non-zero values from confidence_complete event
  const impactServiceAffected = typeof task.impact?.service_affected === 'number' && task.impact.service_affected > 0
    ? task.impact.service_affected 
    : servicesAffectedFromEvent;
  
  const impactedSince = task.impact?.impacted_since || impactedSinceFromEvent;

  return {
    taskId,
    status,
    title: task.title,
    subTasks,
    analysisSteps,
    planSteps: [],
    todos,
    resolved: task.resolved ?? "no", // Default to "no"
    patternConfidence: task.pattern_confidence ?? confidenceEvent?.confidence ?? null,
    matchedPattern: task.matched_pattern ?? confidenceEvent?.matched_pattern ?? null,
    duration: task.duration ?? null,
    impact: {
      duration: task.impact?.impact_duration ?? 0,
      services_affected: impactServiceAffected,
      impacted_since: impactedSince,
    },
    summary: task.summary || null,
    remediation: task.remediation || null,
    error: null,
  };
}

// =============================================================================
// useInvestigationStream Hook
// =============================================================================

// Import notification sound
import notificationSound from '@/assets/sounds/notification.mp3';

export function useInvestigationStream() {
  const [state, setState] = useState<InvestigationStreamState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previousStatusRef = useRef<string | null>(null);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio(notificationSound);
    audioRef.current.volume = 0.5;
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Play notification sound only when transitioning from streaming → completed
  const playNotificationSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Silently fail if audio can't play (e.g., no user interaction yet)
      });
    }
  }, [soundEnabled]);

  // Reset state to initial
  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(initialState);
  }, []);

  // Handle incoming events and update state
  const handleEvent = useCallback((event: InlineStreamEvent) => {
    setState(prev => {
      const newEvents = [...prev.events, event];
      
      // Helper to create a step from any event for the timeline
      const createStepFromEvent = (
        title: string, 
        detail: string, 
        status: AnalysisStep['status'] = 'completed'
      ): AnalysisStep => ({
        title,
        detail,
        status,
        timestamp: event.timestamp,
        tool_name: event.tool_name,
        arguments: event.arguments,
      });
      
      switch (event.type) {
        case 'investigation_started':
          // Check if we already have an investigation_started step
          const startedExists = prev.analysisSteps.some(s => 
            s.title === 'Investigation Started'
          );
          if (startedExists) {
            return { ...prev, events: newEvents, taskId: event.task_id };
          }
          
          const startedStep = createStepFromEvent(
            'Investigation Started',
            event.title || `Task ID: ${event.task_id}`,
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            taskId: event.task_id,
            status: 'streaming' as const,
            title: event.title || prev.title,
            analysisSteps: [...prev.analysisSteps, startedStep],
          };

        case 'tool_call':
          // Handle create_todo tool calls specially - add to todos array AND show in timeline
          if (event.tool_name === 'create_todo' && event.arguments) {
            try {
              const args = JSON.parse(event.arguments);
              const todoContent = args.content || 'Unknown task';
              
              // Check if this todo already exists (prevent duplicates from tool_call + analysis_step)
              const todoExists = prev.todos.some(t => t.content === todoContent);
              if (todoExists) {
                // Skip duplicate, but still add the event to events array
                return { ...prev, events: newEvents };
              }
              
              const newTodo: TodoItem = {
                id: `todo-${Date.now()}-${prev.todos.length}`,
                content: todoContent,
                status: 'in_progress', // Initially in progress during investigation
                priority: args.priority || 'medium',
                assigned_to: args.assigned_to,
                timestamp: event.timestamp,
              };
              const todoStep = createStepFromEvent(
                `Todo: ${todoContent.substring(0, 50)}`,
                `Priority: ${args.priority || 'medium'}${args.assigned_to ? `, Assigned: ${args.assigned_to}` : ''}`,
                'completed'
              );
              return {
                ...prev,
                events: newEvents,
                todos: [...prev.todos, newTodo],
                analysisSteps: [...prev.analysisSteps, todoStep],
              };
            } catch (parseError) {
              console.error('Error parsing create_todo arguments:', parseError);
            }
          }
          // Other tool calls become analysis steps - check for duplicates
          const toolTitle = event.title || `Tool: ${event.tool_name}`;
          const toolCallExists = prev.analysisSteps.some(s => 
            s.title === toolTitle && s.tool_name === event.tool_name && s.timestamp === event.timestamp
          );
          if (toolCallExists) {
            return { ...prev, events: newEvents };
          }
          
          let toolDetail = '';
          try {
            toolDetail = event.arguments ? (JSON.parse(event.arguments).content || event.tool_name || '') : '';
          } catch {
            toolDetail = event.tool_name || '';
          }
          const toolCallStep: AnalysisStep = {
            title: toolTitle,
            detail: toolDetail,
            status: 'completed',
            timestamp: event.timestamp,
            tool_name: event.tool_name,
            arguments: event.arguments,
          };
          return {
            ...prev,
            events: newEvents,
            analysisSteps: [...prev.analysisSteps, toolCallStep],
          };

        case 'analysis_step':
          // Handle create_todo analysis steps - add to todos array
          if (event.tool_name === 'create_todo' && event.arguments) {
            try {
              const args = JSON.parse(event.arguments);
              const todoContent = args.content || 'Unknown task';
              
              // Check if this todo already exists (prevent duplicates)
              const todoExists = prev.todos.some(t => t.content === todoContent);
              if (todoExists) {
                // Skip duplicate todo, but still add the event
                return { ...prev, events: newEvents };
              }
              
              const newTodo: TodoItem = {
                id: `todo-${event.timestamp}-${prev.todos.length}`,
                content: todoContent,
                status: 'in_progress',
                priority: args.priority || 'medium',
                assigned_to: args.assigned_to,
                timestamp: event.timestamp,
              };
              const todoStep: AnalysisStep = {
                // Use the backend's title/detail which is more readable
                title: event.title || `Todo: ${todoContent.substring(0, 50)}`,
                detail: event.detail || `Priority: ${args.priority || 'medium'}`,
                status: (event.status as AnalysisStep['status']) || 'completed',
                timestamp: event.timestamp,
                tool_name: event.tool_name,
                arguments: event.arguments,
              };
              return {
                ...prev,
                events: newEvents,
                todos: [...prev.todos, newTodo],
                analysisSteps: [...prev.analysisSteps, todoStep],
              };
            } catch (parseError) {
              console.error('Error parsing create_todo in analysis_step:', parseError);
            }
          }
          // Regular analysis steps - check for duplicates
          const stepTitle = event.title || event.tool_name || 'Analysis';
          const stepExists = prev.analysisSteps.some(s => 
            s.title === stepTitle && s.timestamp === event.timestamp
          );
          if (stepExists) {
            return { ...prev, events: newEvents };
          }
          
          const analysisStep: AnalysisStep = {
            title: stepTitle,
            detail: event.detail || '',
            status: (event.status as AnalysisStep['status']) || 'completed',
            timestamp: event.timestamp,
            tool_name: event.tool_name,
            arguments: event.arguments,
          };
          return {
            ...prev,
            events: newEvents,
            analysisSteps: [...prev.analysisSteps, analysisStep],
          };

        case 'agent_phase_complete':
          const phaseAgentType = event.sub_task?._agent_type || event.agent_type || 'agent';
          
          // Map agent types to human-readable completion titles
          const phaseCompletionTitles: Record<string, string> = {
            'logging': 'Log Investigation Complete',
            'discovery': 'Resource Discovery Complete',
            'monitoring': 'Metrics Analysis Complete',
            'agent': 'Investigation Phase Complete'
          };
          const phaseCompletionTitle = phaseCompletionTitles[phaseAgentType] || `${phaseAgentType.charAt(0).toUpperCase() + phaseAgentType.slice(1)} Complete`;
          
          if (event.sub_task) {
            const subTaskData = event.sub_task; // Store to avoid TypeScript narrowing issue
            // Check if this subTask already exists (prevent duplicates)
            const subTaskExists = prev.subTasks.some(st => 
              st.subject === subTaskData.subject && st.agent_type === (subTaskData._agent_type || event.agent_type)
            );
            if (subTaskExists) {
              // Skip duplicate, just add event
              return { ...prev, events: newEvents };
            }
            
            const agentStep = createStepFromEvent(
              phaseCompletionTitle,
              event.sub_task.subject || event.sub_task.reason || 'Phase completed',
              'completed'
            );
            const subTask: SubTaskState = {
              subject: event.sub_task.subject,
              status: event.sub_task.status,
              reason: event.sub_task.reason,
              goal: event.sub_task.goal,
              plan: event.sub_task.plan,
              discovery: event.sub_task.discovery,
              agent_type: event.sub_task._agent_type || event.agent_type,
              timestamp: event.sub_task._timestamp || event.timestamp,
            };
            return {
              ...prev,
              events: newEvents,
              subTasks: [...prev.subTasks, subTask],
              analysisSteps: [...prev.analysisSteps, agentStep],
            };
          }
          // No sub_task data, just add event
          return { ...prev, events: newEvents };

        case 'investigation_plan':
          // Handle both formats: plan array (new) or plan_steps string array (legacy)
          let steps: string[] = prev.planSteps;
          let planDetail = '';
          if (event.plan && Array.isArray(event.plan)) {
            steps = event.plan.map(p => p.description);
            planDetail = `${event.plan.length} steps planned`;
          } else if (event.plan_steps) {
            steps = event.plan_steps;
            planDetail = `${event.plan_steps.length} steps planned`;
          }
          const planStep = createStepFromEvent(
            'Investigation Plan Created',
            planDetail || 'Plan generated',
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            planSteps: steps,
            analysisSteps: [...prev.analysisSteps, planStep],
          };

        case 'pattern_confidence':
          const confidenceStep = createStepFromEvent(
            `Pattern Matched: ${event.matched_pattern || 'Unknown'}`,
            `Confidence: ${event.confidence}%`,
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            patternConfidence: event.confidence ?? prev.patternConfidence,
            matchedPattern: event.matched_pattern ?? prev.matchedPattern,
            analysisSteps: [...prev.analysisSteps, confidenceStep],
          };

        case 'impact_analysis':
          // Normalize backend field names to internal state format
          const normalizedImpact = event.impact ? {
            duration: event.impact.impact_duration,
            services_affected: event.impact.service_affected,
            impacted_since: event.impact.impacted_since,
          } : prev.impact;
          const impactStep = createStepFromEvent(
            'Impact Analysis Complete',
            event.impact 
              ? `${event.impact.service_affected} service(s) affected, impacted for ${event.impact.impact_duration}s`
              : 'Impact assessed',
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            impact: normalizedImpact,
            analysisSteps: [...prev.analysisSteps, impactStep],
          };

        case 'task_duration':
          // Check for duplicate duration
          const durationExists = prev.analysisSteps.some(s => s.title === 'Duration Recorded');
          if (durationExists) {
            return { ...prev, events: newEvents, duration: event.duration ?? prev.duration };
          }
          const durationStep = createStepFromEvent(
            'Duration Recorded',
            `Investigation took ${event.duration}s`,
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            duration: event.duration ?? prev.duration,
            analysisSteps: [...prev.analysisSteps, durationStep],
          };

        case 'investigation_summary':
          // Check for duplicate summary
          const summaryExists = prev.analysisSteps.some(s => s.title === 'Summary Generated');
          if (summaryExists) {
            return { ...prev, events: newEvents, summary: event.summary ?? prev.summary };
          }
          const summaryStep = createStepFromEvent(
            'Summary Generated',
            event.summary?.substring(0, 100) + (event.summary && event.summary.length > 100 ? '...' : '') || 'Summary available',
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            summary: event.summary ?? prev.summary,
            analysisSteps: [...prev.analysisSteps, summaryStep],
          };

        case 'investigation_remediation':
          // Check for duplicate remediation
          const remediationExists = prev.analysisSteps.some(s => s.title === 'Remediation Suggested');
          if (remediationExists) {
            return { ...prev, events: newEvents, remediation: event.remediation ?? prev.remediation };
          }
          const remediationStep = createStepFromEvent(
            'Remediation Suggested',
            'Remediation steps are now available',
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            remediation: event.remediation ?? prev.remediation,
            analysisSteps: [...prev.analysisSteps, remediationStep],
          };

        case 'investigation_complete':
          // Check for duplicate complete
          const completeExists = prev.analysisSteps.some(s => s.title === 'Investigation Complete');
          if (completeExists) {
            return { ...prev, events: newEvents, isComplete: true, status: 'completed' as const };
          }
          // Mark all todos as completed when investigation finishes
          const completedTodos = prev.todos.map(todo => ({
            ...todo,
            status: todo.status === 'in_progress' ? 'completed' as const : todo.status,
          }));
          const completeStep = createStepFromEvent(
            'Investigation Complete',
            'All analysis phases finished',
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            todos: completedTodos,
            isComplete: true,
            status: 'completed' as const,
            analysisSteps: [...prev.analysisSteps, completeStep],
          };

        // Handle confidence_complete to update state with confidence metrics
        case 'confidence_complete':
          const confidenceCompleteStep = createStepFromEvent(
            `Confidence: ${event.confidence}%`,
            event.matched_pattern 
              ? `Pattern: ${event.matched_pattern} | ${event.services_affected} service(s) affected` 
              : `${event.services_affected} service(s) affected | ${event.impact_severity} severity`,
            'completed'
          );
          return {
            ...prev,
            events: newEvents,
            patternConfidence: event.confidence ?? prev.patternConfidence,
            matchedPattern: event.matched_pattern ?? prev.matchedPattern,
            impact: {
              duration: prev.impact?.duration ?? 0,
              services_affected: event.services_affected ?? prev.impact?.services_affected ?? 0,
              impacted_since: event.impacted_since 
                ? new Date(event.impacted_since).getTime() / 1000 
                : prev.impact?.impacted_since ?? 0,
            },
            analysisSteps: [...prev.analysisSteps, confidenceCompleteStep],
          };

        case 'error':
          const errorStep = createStepFromEvent(
            'Error',
            event.error || 'Unknown error occurred',
            'error'
          );
          return {
            ...prev,
            events: newEvents,
            status: 'error' as const,
            error: event.error || 'Unknown error',
            analysisSteps: [...prev.analysisSteps, errorStep],
          };

        case 'done':
          return {
            ...prev,
            events: newEvents,
            isComplete: true,
            status: prev.status === 'error' ? 'error' as const : 'completed' as const,
          };

        // Title streaming events (from separate endpoint or same SSE)
        case 'session_title_token':
        case 'title_token':
          return {
            ...prev,
            events: newEvents,
            streamingTitle: prev.streamingTitle + ((event as any).token || ''),
            isTitleStreaming: true,
          };

        case 'session_title_complete':
        case 'title_complete':
          return {
            ...prev,
            events: newEvents,
            title: (event as any).title || prev.streamingTitle || prev.title,
            streamingTitle: '',
            isTitleStreaming: false,
          };

        default:
          // For any unknown events, still add them to the timeline
          const unknownStep = createStepFromEvent(
            event.type,
            'Event received',
            'completed'
          );
          return { 
            ...prev, 
            events: newEvents,
            analysisSteps: [...prev.analysisSteps, unknownStep],
          };
      }
    });
  }, []);

  // Start a new investigation
  const startInvestigation = useCallback(async (request: InvestigationRequest) => {
    reset();
    setState(prev => ({ ...prev, status: 'connecting' }));

    try {
      const { taskId, abortController } = await startInlineInvestigation(request, {
        onEvent: handleEvent,
        onError: (error) => {
          const errorMessage = error instanceof Error ? error.message : (error as InlineStreamEvent).error || 'Unknown error';
          setState(prev => ({
            ...prev,
            status: 'error',
            error: errorMessage,
          }));
        },
        onDone: () => {
          setState(prev => ({
            ...prev,
            status: prev.status === 'error' ? 'error' : 'completed',
            isComplete: true,
          }));
        },
      });

      abortControllerRef.current = abortController;
      setState(prev => ({ ...prev, taskId }));

      return taskId;
    } catch (error) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to start investigation',
      }));
      throw error;
    }
  }, [reset, handleEvent]);

  /**
   * Load task and subscribe to events following OpenCode pattern:
   * 1. First fetch task data via REST to get current state
   * 2. If task is still processing, subscribe to SSE for live updates (SSE replays history)
   * 3. If task is completed, just display the data from REST (no SSE needed)
   * 
   * IMPORTANT: SSE replays ALL historical events, so we don't populate analysisSteps/todos/subTasks
   * from REST when processing - otherwise we'd get duplicates.
   */
  const loadAndSubscribe = useCallback(async (taskId: string) => {
    // Cancel any existing subscription
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset state and set loading
    reset();
    setState(prev => ({ ...prev, status: 'loading', taskId, error: null }));

    try {
      // Step 1: Fetch task data via REST API
      const taskData = await getTaskDetails(taskId);
      
      // Check if task is still processing
      const isProcessing = taskData.status === 'processed' || 
                          (taskData.status !== 'completed' && taskData.status !== 'cancelled');
      
      if (isProcessing) {
        // Task is still in progress - SSE will replay all historical events
        // Only set basic metadata, not events/todos/subTasks (to avoid duplicates)
        setState(prev => ({
          ...prev,
          status: 'connecting',
          taskId,
          title: taskData.title,
          // Don't populate analysisSteps, todos, subTasks here - SSE will handle it
        }));
        
        const abortController = subscribeToTaskEvents(taskId, {
          onEvent: handleEvent,
          onError: (error) => {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            // Only set error if it's not an abort error
            if (!errorMessage.toLowerCase().includes('cancelled') && 
                !errorMessage.toLowerCase().includes('aborted')) {
              setState(prev => ({
                ...prev,
                status: 'error',
                error: errorMessage,
              }));
            }
          },
          onDone: () => {
            setState(prev => ({
              ...prev,
              status: prev.status === 'error' ? 'error' : 'completed',
              isComplete: true,
            }));
          },
        });

        abortControllerRef.current = abortController;
      } else {
        // Task is completed/cancelled - use REST data (no SSE needed)
        const taskState = taskDetailsToState(taskData, taskId);
        setState(prev => ({ ...prev, ...taskState }));
      }
      
    } catch (error) {
      console.error('Error loading task:', error);
      setState(prev => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to load task',
      }));
    }
  }, [reset, handleEvent]);

  // Legacy method - Subscribe to existing task events (for reconnection)
  // Prefer loadAndSubscribe for the OpenCode pattern
  const subscribeToTask = useCallback((taskId: string) => {
    // Use the new loadAndSubscribe method which follows OpenCode pattern
    loadAndSubscribe(taskId);
  }, [loadAndSubscribe]);

  // Cancel/abort the current stream
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // Generate title after investigation completes
  const generateTitle = useCallback((userPrompt?: string) => {
    const currentState = state;
    
    console.log('[TitleGen] generateTitle called with:', {
      taskId: currentState.taskId,
      hasSummary: !!currentState.summary,
      userPrompt,
    });
    
    if (!currentState.taskId || !currentState.summary) {
      console.warn('[TitleGen] Cannot generate title: missing taskId or summary');
      return null;
    }

    console.log('[TitleGen] Starting title streaming for task:', currentState.taskId);

    // Set title streaming state
    setState(prev => ({
      ...prev,
      isTitleStreaming: true,
      streamingTitle: '',
    }));

    const abortController = streamTitleGeneration(
      {
        task_id: currentState.taskId,
        user_prompt: userPrompt || currentState.userPrompt || 'Kubernetes investigation',
        root_cause: currentState.summary,
      },
      {
        onToken: (token) => {
          console.log('[TitleGen] Token received:', token);
          setState(prev => ({
            ...prev,
            streamingTitle: prev.streamingTitle + token,
          }));
        },
        onComplete: (title) => {
          console.log('[TitleGen] Title complete:', title);
          setState(prev => ({
            ...prev,
            title: title,
            streamingTitle: '',
            isTitleStreaming: false,
          }));
        },
        onError: (error) => {
          console.error('[TitleGen] Title generation error:', error);
          setState(prev => ({
            ...prev,
            isTitleStreaming: false,
            // Keep the existing title if generation fails
            title: prev.title || 'Investigation Report',
          }));
        },
      }
    );

    return abortController;
  }, [state.taskId, state.summary, state.userPrompt]);



  // Play notification sound and send notification when transitioning from streaming → completed
  useEffect(() => {
    const prevStatus = previousStatusRef.current;
    const currentStatus = state.status;
    
    // Only trigger if we were streaming and now completed
    if (prevStatus === 'streaming' && currentStatus === 'completed') {
      playNotificationSound();
      
      // Send notification to dropdown
      const title = `Investigation ${state.taskId}`;
      notify(
        'investigation',
        title,
        'Investigation has completed'
      );
    }
    
    // Update previous status
    previousStatusRef.current = currentStatus;
  }, [state.status, state.title, state.taskId, playNotificationSound]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    state,
    startInvestigation,
    subscribeToTask,
    loadAndSubscribe,
    cancel,
    reset,
    generateTitle,
    isStreaming: state.status === 'streaming',
    isCompleted: state.status === 'completed',
    isError: state.status === 'error',
    isLoading: state.status === 'loading',
    isTitleStreaming: state.isTitleStreaming,
    // Sound controls
    soundEnabled,
    setSoundEnabled,
  };
}

export default useInvestigationStream;
