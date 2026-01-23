import { ORCHESTRATOR_URL } from '@/config';
import { fetch } from '@tauri-apps/plugin-http';
import {
  InvestigationRequest,
  InvestigationResponse,
  InvestigationStatus,
  TaskDetails,
  InvestigationTaskDetails,
  InvestigationListResponse,
  CancelResponse,
  InvestigationMetrics,
  StreamEvent,
  StreamCallbacks,
  DeleteResponse
} from '@/types/task';

/**
 * Submit a new investigation with inline SSE streaming.
 * 
 * The POST /investigate endpoint now returns an SSE stream directly.
 * This function reads just the first event to get the task_id, then
 * closes the connection. The task report page will reconnect via
 * subscribeToTaskEvents to get all events.
 * 
 * @param request Investigation request parameters
 * @returns Promise with investigation response containing task_id
 */
export const submitInvestigationTask = async (
  request: InvestigationRequest
): Promise<InvestigationResponse> => {
  const abortController = new AbortController();
  
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to submit investigation: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response has no body');
    }

    // Read stream until we get the task_id from the first event
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let taskId: string | null = null;

    try {
      while (!taskId) {
        const { done, value } = await reader.read();
        
        if (done) {
          throw new Error('Stream ended before receiving task_id');
        }
        
        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          if (line.startsWith('data: ')) {
            try {
              const jsonData = line.slice(6);
              const event = JSON.parse(jsonData);
              
              if (event.task_id) {
                taskId = event.task_id;
                break;
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError, line);
            }
          }
        }
      }
    } finally {
      // Close the stream - the task report page will reconnect
      reader.releaseLock();
      abortController.abort();
    }

    if (!taskId) {
      throw new Error('No task_id received from investigation stream');
    }

    return {
      task_id: taskId,
      status: 'processing',
      message: 'Investigation started'
    };
  } catch (error) {
    // AbortError is expected when we intentionally close the stream
    if ((error as Error).name === 'AbortError') {
      console.log('Stream closed after getting task_id');
      // Don't throw - this is expected behavior
      return {
        task_id: '', // This shouldn't happen as we return before abort
        status: 'processing',
        message: 'Investigation started'
      };
    }
    console.error('Error submitting investigation:', error);
    throw error;
  }
};

/**
 * Get the current status and results of an investigation
 * @param taskId Investigation task identifier
 * @returns Promise with investigation status
 */
export const getInvestigationStatus = async (
  taskId: string
): Promise<InvestigationStatus> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate/${taskId}/status`);

    if (!response.ok) {
      throw new Error(`Failed to get investigation status: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting investigation status:', error);
    throw error;
  }
};

/**
 * Get comprehensive task details including summary, remediation, and sub-tasks
 * @param taskId Investigation task identifier
 * @returns Promise with detailed task information
 */
export const getTaskDetails = async (
  taskId: string
): Promise<TaskDetails> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/tasks/${taskId}`);

    if (!response.ok) {
      throw new Error(`Failed to get task details: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting task details:', error);
    throw error;
  }
};

/**
 * Get the original investigation request details
 * @param taskId Investigation task identifier
 * @returns Promise with investigation task details
 */
export const getInvestigationTaskDetails = async (
  taskId: string
): Promise<InvestigationTaskDetails> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate/${taskId}`);

    if (!response.ok) {
      throw new Error(`Failed to get investigation task details: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting investigation task details:', error);
    throw error;
  }
};

/**
 * List recent investigations with optional status filtering
 * @param limit Number of results (1-100, default: 50)
 * @param status Filter by status (processing/completed/failed)
 * @returns Promise with investigations list and total count
 */
export const listInvestigations = async (
  limit: number = 50,
  status?: string
): Promise<InvestigationListResponse> => {
  try {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    if (status) {
      params.append('status', status);
    }

    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to list investigations: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing investigations:', error);
    throw error;
  }
};

/**
 * Cancel a running or queued investigation (without deleting)
 * @param taskId Investigation task identifier
 * @returns Promise with cancellation response
 */
export const cancelInvestigation = async (
  taskId: string
): Promise<CancelResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate/${taskId}/cancel`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel investigation: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error canceling investigation:', error);
    throw error;
  }
};

/**
 * Delete an investigation (cancels and removes from database)
 * @param taskId Investigation task identifier
 * @returns Promise with deletion response
 */
export const deleteInvestigation = async (
  taskId: string
): Promise<DeleteResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate/${taskId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete investigation: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting investigation:', error);
    throw error;
  }
};

/**
 * Get queue and investigation metrics for monitoring
 * @returns Promise with investigation metrics
 */
export const getInvestigationMetrics = async (): Promise<InvestigationMetrics> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate/metrics`);

    if (!response.ok) {
      throw new Error(`Failed to get investigation metrics: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting investigation metrics:', error);
    throw error;
  }
};

/**
 * Response type for PATCH task request
 */
interface PatchTaskResponse {
  status: string;
  message: string;
  task: {
    id: string;
    task_id: string;
    resolved: boolean;
    [key: string]: unknown;
  };
}

/**
 * Update a task's resolved status (PATCH)
 * @param taskId Task identifier
 * @param resolved "yes" or "no"
 * @returns Promise with updated task
 */
export const patchTask = async (
  taskId: string,
  resolved: string
): Promise<PatchTaskResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ resolved }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update task: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
};

/**
 * Submit an investigation with real-time streaming updates
 * @param request Investigation request parameters
 * @param callbacks Stream event callbacks
 * @returns Promise that resolves when streaming is complete
 */
export const streamingInvestigation = async (
  request: InvestigationRequest,
  callbacks: StreamCallbacks
): Promise<void> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/stream/api/investigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(request),
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Streaming investigation failed: ${response.status} ${response.statusText}`);
    }

    await processInvestigationStream(response, callbacks);
  } catch (error) {
    console.error('Error in streaming investigation:', error);
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
};

/**
 * Process investigation stream from orchestrator API
 */
async function processInvestigationStream(
  response: Response,
  callbacks: StreamCallbacks
): Promise<void> {
  if (!response.body) {
    throw new Error('Response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        if (callbacks.onComplete) {
          callbacks.onComplete();
        }
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (line.startsWith('data: ')) {
          try {
            const jsonData = line.slice(6);
            const event: StreamEvent = JSON.parse(jsonData);
            
            // Route events to appropriate callbacks
            switch (event.type) {
              case 'investigation_started':
                if (callbacks.onInvestigationStarted) {
                  callbacks.onInvestigationStarted(event);
                }
                break;
                
              case 'tool_call':
                if (callbacks.onToolCall) {
                  callbacks.onToolCall(event);
                }
                break;
                
              case 'tool_output':
                if (callbacks.onToolOutput) {
                  callbacks.onToolOutput(event);
                }
                break;
                
              case 'analysis_update':
                if (callbacks.onAnalysisUpdate) {
                  callbacks.onAnalysisUpdate(event);
                }
                break;
                
              case 'investigation_summary':
                if (callbacks.onInvestigationSummary) {
                  callbacks.onInvestigationSummary(event);
                }
                break;
                
              default:
                console.warn('Unknown event type:', event.type);
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error, line);
          }
        }
      }
    }
  } catch (error) {
    console.error('Investigation stream processing error:', error);
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * List all tasks with optional filtering
 * @param limit Number of results (1-100, default: 50)
 * @returns Promise with tasks list
 */
export const listTasks = async (limit: number = 50): Promise<TaskDetails[]> => {
  try {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());

    const response = await fetch(`${ORCHESTRATOR_URL}/api/tasks?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`Failed to list tasks: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.tasks || data; // Handle different response formats
  } catch (error) {
    console.error('Error listing tasks:', error);
    throw error;
  }
};

/**
 * Delete a completed task and its associated subtasks and events
 * @param taskId Investigation task identifier
 * @returns Promise with deletion response
 */
export const deleteTask = async (
  taskId: string
): Promise<DeleteResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/tasks/${taskId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete task: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
};

// =============================================================================
// NEW INLINE SSE STREAMING API (opencode pattern)
// =============================================================================

/**
 * Event types for inline SSE streaming from POST /investigate
 */
export interface InlineStreamEvent {
  type: 
    | 'investigation_started'
    | 'tool_call'
    | 'analysis_step'
    | 'agent_phase_complete'
    | 'investigation_plan'
    | 'pattern_confidence'
    | 'impact_analysis'
    | 'task_duration'
    | 'investigation_draft'
    | 'investigation_summary'
    | 'investigation_remediation'
    | 'critique_started'
    | 'critique_complete'
    | 'refinement_started'
    | 'refinement_complete'
    | 'confidence_started'
    | 'confidence_complete'
    | 'investigation_complete'
    | 'session_title_token'
    | 'session_title_complete'
    | 'title_token'
    | 'title_complete'
    | 'error'
    | 'done';
  task_id: string;
  timestamp: string;
  // investigation_started
  title?: string;
  // tool_call
  tool_name?: string;
  arguments?: string;
  // analysis_step
  step_index?: number;
  detail?: string;
  status?: string;
  // agent_phase_complete
  sub_task?: {
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
    _agent_type?: string;
    _timestamp?: string;
  };
  agent_type?: string;
  subject?: string;
  // investigation_plan
  plan?: Array<{ step: number; description: string }>;
  plan_steps?: string[]; // Legacy/alternative format
  total_phases?: number;
  // pattern_confidence & confidence_complete
  confidence?: number;
  matched_pattern?: string;
  // impact_analysis - note: backend uses impact_duration and service_affected
  impact?: {
    impact_duration: number;
    service_affected: number;
    impacted_since: number;
  };
  // confidence_complete specific fields
  impacted_since?: string;  // ISO 8601 timestamp
  last_seen?: string;       // ISO 8601 timestamp
  services_affected?: number;
  impact_severity?: string;
  affected_resources?: Array<{ type: string; name: string; namespace: string }>;
  // critique_complete specific fields
  approved?: boolean;
  critique_summary?: string;
  issues_count?: number;
  refinement_needed?: boolean;
  // investigation_draft
  is_draft?: boolean;
  // task_duration
  duration?: number;
  // investigation_summary
  summary?: string;
  // investigation_remediation
  remediation?: string;
  // title streaming
  token?: string;
  // error
  error?: string;
}

/**
 * Callbacks for inline SSE streaming
 */
export interface InlineSSECallbacks {
  onEvent?: (event: InlineStreamEvent) => void;
  onInvestigationStarted?: (event: InlineStreamEvent) => void;
  onToolCall?: (event: InlineStreamEvent) => void;
  onAnalysisStep?: (event: InlineStreamEvent) => void;
  onAgentPhaseComplete?: (event: InlineStreamEvent) => void;
  onInvestigationPlan?: (event: InlineStreamEvent) => void;
  onPatternConfidence?: (event: InlineStreamEvent) => void;
  onImpactAnalysis?: (event: InlineStreamEvent) => void;
  onTaskDuration?: (event: InlineStreamEvent) => void;
  onInvestigationSummary?: (event: InlineStreamEvent) => void;
  onInvestigationRemediation?: (event: InlineStreamEvent) => void;
  onInvestigationComplete?: (event: InlineStreamEvent) => void;
  onError?: (error: Error | InlineStreamEvent) => void;
  onDone?: () => void;
}

/**
 * Start an inline investigation with SSE streaming (opencode pattern).
 * 
 * The POST /investigate endpoint returns an SSE stream directly.
 * Events are streamed in real-time and also persisted to DB.
 * Returns the task_id for future reconnection.
 * 
 * @param request Investigation request parameters
 * @param callbacks Stream event callbacks
 * @returns Promise that resolves with task_id when stream opens
 */
export const startInlineInvestigation = async (
  request: InvestigationRequest,
  callbacks: InlineSSECallbacks
): Promise<{ taskId: string; abortController: AbortController }> => {
  const abortController = new AbortController();
  
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Investigation failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let taskId: string | null = null;
      let resolved = false;

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              if (callbacks.onDone) {
                callbacks.onDone();
              }
              break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.trim()) continue;
              
              if (line.startsWith('data: ')) {
                try {
                  const jsonData = line.slice(6);
                  const event: InlineStreamEvent = JSON.parse(jsonData);
                  
                  // Capture task_id from first event and resolve
                  if (event.task_id && !taskId) {
                    taskId = event.task_id;
                    if (!resolved) {
                      resolved = true;
                      resolve({ taskId, abortController });
                    }
                  }
                  
                  // Call generic onEvent callback
                  if (callbacks.onEvent) {
                    callbacks.onEvent(event);
                  }
                  
                  // Route events to appropriate callbacks
                  switch (event.type) {
                    case 'investigation_started':
                      if (callbacks.onInvestigationStarted) {
                        callbacks.onInvestigationStarted(event);
                      }
                      break;
                      
                    case 'tool_call':
                      if (callbacks.onToolCall) {
                        callbacks.onToolCall(event);
                      }
                      break;
                      
                    case 'analysis_step':
                      if (callbacks.onAnalysisStep) {
                        callbacks.onAnalysisStep(event);
                      }
                      break;
                      
                    case 'agent_phase_complete':
                      if (callbacks.onAgentPhaseComplete) {
                        callbacks.onAgentPhaseComplete(event);
                      }
                      break;
                      
                    case 'investigation_plan':
                      if (callbacks.onInvestigationPlan) {
                        callbacks.onInvestigationPlan(event);
                      }
                      break;
                      
                    case 'pattern_confidence':
                      if (callbacks.onPatternConfidence) {
                        callbacks.onPatternConfidence(event);
                      }
                      break;
                      
                    case 'impact_analysis':
                      if (callbacks.onImpactAnalysis) {
                        callbacks.onImpactAnalysis(event);
                      }
                      break;
                      
                    case 'task_duration':
                      if (callbacks.onTaskDuration) {
                        callbacks.onTaskDuration(event);
                      }
                      break;
                      
                    case 'investigation_summary':
                      if (callbacks.onInvestigationSummary) {
                        callbacks.onInvestigationSummary(event);
                      }
                      break;
                      
                    case 'investigation_remediation':
                      if (callbacks.onInvestigationRemediation) {
                        callbacks.onInvestigationRemediation(event);
                      }
                      break;
                      
                    case 'investigation_complete':
                      if (callbacks.onInvestigationComplete) {
                        callbacks.onInvestigationComplete(event);
                      }
                      break;
                      
                    case 'error':
                      if (callbacks.onError) {
                        callbacks.onError(event);
                      }
                      break;
                      
                    case 'done':
                      if (callbacks.onDone) {
                        callbacks.onDone();
                      }
                      break;
                      
                    default:
                      console.warn('Unknown event type:', event.type);
                  }
                } catch (parseError) {
                  console.error('Error parsing SSE data:', parseError, line);
                }
              }
            }
          }
        } catch (error) {
          const errorMessage = (error as Error).message || String(error);
          const isAbortError = 
            (error as Error).name === 'AbortError' || 
            errorMessage.toLowerCase().includes('cancelled') ||
            errorMessage.toLowerCase().includes('aborted');
          
          if (isAbortError) {
            console.log('Stream closed (intentional)');
            return;
          }
          console.error('Stream processing error:', error);
          if (callbacks.onError) {
            callbacks.onError(error instanceof Error ? error : new Error(String(error)));
          }
        } finally {
          reader.releaseLock();
        }
      };

      // Start processing stream
      processStream();

    } catch (error) {
      console.error('Error starting inline investigation:', error);
      reject(error);
    }
  });
};

/**
 * Subscribe to SSE events for an existing task (reconnection support).
 * 
 * GET /investigate/{task_id}/event returns stored events for replay
 * plus any new events if investigation is still running.
 * 
 * @param taskId Investigation task identifier
 * @param callbacks Stream event callbacks
 * @returns AbortController to cancel subscription
 */
export const subscribeToTaskEvents = (
  taskId: string,
  callbacks: InlineSSECallbacks
): AbortController => {
  const abortController = new AbortController();
  
  const connect = async () => {
    try {
      const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate/${taskId}/event`, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
        },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to subscribe to events: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            if (callbacks.onDone) {
              callbacks.onDone();
            }
            break;
          }
          
          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6);
                const event: InlineStreamEvent = JSON.parse(jsonData);
                
                // Call generic onEvent callback
                if (callbacks.onEvent) {
                  callbacks.onEvent(event);
                }
                
                // Route to specific callbacks (same switch as above)
                switch (event.type) {
                  case 'investigation_started':
                    callbacks.onInvestigationStarted?.(event);
                    break;
                  case 'tool_call':
                    callbacks.onToolCall?.(event);
                    break;
                  case 'analysis_step':
                    callbacks.onAnalysisStep?.(event);
                    break;
                  case 'agent_phase_complete':
                    callbacks.onAgentPhaseComplete?.(event);
                    break;
                  case 'investigation_plan':
                    callbacks.onInvestigationPlan?.(event);
                    break;
                  case 'pattern_confidence':
                    callbacks.onPatternConfidence?.(event);
                    break;
                  case 'impact_analysis':
                    callbacks.onImpactAnalysis?.(event);
                    break;
                  case 'task_duration':
                    callbacks.onTaskDuration?.(event);
                    break;
                  case 'investigation_summary':
                    callbacks.onInvestigationSummary?.(event);
                    break;
                  case 'investigation_remediation':
                    callbacks.onInvestigationRemediation?.(event);
                    break;
                  case 'investigation_complete':
                    callbacks.onInvestigationComplete?.(event);
                    break;
                  case 'error':
                    callbacks.onError?.(event);
                    break;
                  case 'done':
                    callbacks.onDone?.();
                    break;
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError, line);
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      const errorMessage = (error as Error).message || String(error);
      const isAbortError = 
        (error as Error).name === 'AbortError' || 
        errorMessage.toLowerCase().includes('cancelled') ||
        errorMessage.toLowerCase().includes('aborted');
      
      if (isAbortError) {
        // This is expected when component unmounts or navigation occurs
        console.log('Subscription closed (intentional)');
        return;
      }
      console.error('Error subscribing to task events:', error);
      if (callbacks.onError) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  // Start connection
  connect();
  
  return abortController;
};

// =============================================================================
// TITLE GENERATION API
// =============================================================================

/**
 * Request for title generation
 */
export interface TitleGenerationRequest {
  task_id: string;
  user_prompt: string;
  root_cause: string;
  model?: string;
}

/**
 * Callbacks for title generation streaming
 */
export interface TitleStreamCallbacks {
  onToken?: (token: string) => void;
  onComplete?: (title: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Stream title generation from the backend.
 * 
 * Calls POST /orchestrator/api/generate/title and streams title tokens.
 * The title is generated based on root cause analysis and user prompt.
 * 
 * @param request Title generation request
 * @param callbacks Stream callbacks for tokens and completion
 * @returns AbortController to cancel the stream
 */
export const streamTitleGeneration = (
  request: TitleGenerationRequest,
  callbacks: TitleStreamCallbacks
): AbortController => {
  const abortController = new AbortController();
  
  const connect = async () => {
    try {
      const response = await fetch(`${ORCHESTRATOR_URL}/api/generate/title`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to generate title: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (!line.trim()) continue;
            
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.slice(6);
                const event = JSON.parse(jsonData);
                
                // Handle text chunks (same format as log_analyzer/event_analyzer)
                if (event.text && callbacks.onToken) {
                  callbacks.onToken(event.text);
                }
                
                // Handle title complete
                if (event.title_complete && callbacks.onComplete) {
                  callbacks.onComplete(event.title_complete);
                }
                
                // Also handle legacy format just in case
                if (event.type === 'title_token' && event.token && callbacks.onToken) {
                  callbacks.onToken(event.token);
                } else if (event.type === 'title_complete' && event.title && callbacks.onComplete) {
                  callbacks.onComplete(event.title);
                }
              } catch (parseError) {
                // Ignore parse errors for non-JSON lines like [DONE]
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      const errorMessage = (error as Error).message || String(error);
      const isAbortError = 
        (error as Error).name === 'AbortError' || 
        errorMessage.toLowerCase().includes('cancelled') ||
        errorMessage.toLowerCase().includes('aborted');
      
      if (isAbortError) {
        console.log('Title generation stream closed');
        return;
      }
      
      console.error('Error in title generation:', error);
      if (callbacks.onError) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  connect();
  
  return abortController;
};