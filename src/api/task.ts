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
 * Submit a new investigation to the task queue
 * @param request Investigation request parameters
 * @returns Promise with investigation response containing task_id and poll_url
 */
export const submitInvestigationTask = async (
  request: InvestigationRequest
): Promise<InvestigationResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit investigation: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
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
 * Cancel a queued investigation
 * @param taskId Investigation task identifier
 * @returns Promise with cancellation response
 */
export const cancelInvestigation = async (
  taskId: string
): Promise<CancelResponse> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/investigate/${taskId}`, {
      method: 'DELETE',
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