import { ORCHESTRATOR_URL } from "@/config";
import { fetch } from '@tauri-apps/plugin-http';
import { HITLDecisionRequest, HITLDecisionResponse, HITLStatusResponse, HITLToggleRequest, HITLToggleResponse, HITLPendingRequestsResponse } from '@/types/hitl';
import { ReasoningEffortLevel } from "@/components/custom";
// Type definitions

export interface ChatRequest {
  message: string;
  chat_history?: ChatMessage[];
  model?: string;
  kubecontext?: string;
  kubeconfig?: string;
  prompt?: string;
  files?: FileContent[];
  reasoning_effort?: ReasoningEffortLevel;
  auto_approve?: boolean;  // Auto-approve all tool executions
  session_id?: string;  // OpenCode-style session ID - if provided, continues existing session
}

export interface CompletionRequest {
  message: string;
  conversation_id?: string;
  model?: string;
  kubecontext?: string;
  prompt?: string;
  files?: FileContent[];
  reasoning_effort?: ReasoningEffortLevel;
}

export interface ChatMessage {
  role: string;
  content: string;
  name?: string;
}

export interface FileContent {
  resource_name: string;
  resource_content: string;
}

export interface ExecuteCommandRequest {
  command: string;
  kubecontext?: string;
}

export interface ExecuteCommandResponse {
  success: boolean;
  command: string;
  output: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ConversationWithMessages {
  conversation: Conversation;
  messages: Message[];
}

export interface Message {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  name?: string;
  created_at: string;
  model?: string;
  kubecontext?: string;
}

export interface ConversationCreateRequest {
  title?: string;
}

export interface ConversationUpdateRequest {
  title: string;
}

// Tool call interface
export interface ToolCall {
  tool: string;
  name: string;
  arguments: any;
  call_id: string;
  output?: string | {
    command?: string;
    output?: string;
  } | any;
  success?: boolean;
  isPending?: boolean;
}

// Todo item interface - OpenCode style with id and priority
export interface TodoItem {
  id: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  content: string;
  priority?: 'high' | 'medium' | 'low';
}

// TODO: Custom Component Mapping Strategy (Option 1)
// After tool_call_end event, check tool name and yield custom_component event
// with parsed data for GenUI components. Implement get_component_for_tool()
// mapping function in stream_utils.py around line 578-591
// Example: list_pods -> PodsList component, describe_deployment -> DeploymentDetail component

// Stream event types from backend
export interface StreamEvent {
  type: string;
  [key: string]: any;
}

// Stream callback types
export interface ChatStreamCallbacks {
  onTraceId?: (traceId: string) => void;
  onSessionId?: (sessionId: string) => void;  // OpenCode-style session management
  onIterationStart?: (iteration: number) => void;
  onText?: (text: string) => void;
  onReasoningText?: (text: string) => void;
  onToolCallStart?: (tool: string, args: any, callId: string) => void;
  onToolApprovalRequest?: (tool: string, args: any, callId: string, message: string) => void;
  onToolApproved?: (tool: string, callId: string, scope: string, message: string) => void;
  onToolDenied?: (tool: string, callId: string, message: string) => void;
  onToolRedirected?: (tool: string, callId: string, message: string, newInstruction: string) => void;
  onToolTimeout?: (tool: string, callId: string, message: string) => void;
  onToolCallEnd?: (tool: string, result: string, success: boolean, callId: string) => void;
  onCustomComponent?: (component: string, props: any, callId: string) => void;
  onPlanCreated?: (todos: TodoItem[], todoCount: number, traceId: string, callId: string, timestamp: string) => void;
  onPlanUpdated?: (todos: TodoItem[], todoCount: number, traceId: string, callId: string, timestamp: string) => void;
  // OpenCode-style todo events
  onTodoCreated?: (todo: TodoItem, totalTodos: number, sessionId: string, callId: string) => void;
  onTodoUpdated?: (todo: TodoItem, totalTodos: number, sessionId: string, callId: string) => void;
  onTodoDeleted?: (todoId: string, remainingTodos: number, sessionId: string, callId: string) => void;
  onTodoCleared?: (sessionId: string, callId: string) => void;
  onUserMessageInjected?: (message: string) => void;
  onUserCancelled?: (message: string) => void;
  onUsage?: (tokens: { input: number; output: number; total: number }) => void;  // OpenCode-style token tracking
  onDone?: (reason: string, message?: string, tokens?: { input: number; output: number; total: number }) => void;
  onError?: (error: Error | string) => void;
}

/**
 * Send a chat message to the orchestrator API with streaming response
 * This doesn't store the conversation in the database
 */
export const chatStream = async (
  request: ChatRequest,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal
): Promise<void> => {

  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request),
      cache: 'no-store',
      signal
    });

    if (!response.ok) {
      throw new Error(`Chat request failed with status: ${response.status}`);
    }

    await processChatStream(response, callbacks, signal);
  } catch (error) {
    // Check if error is due to abort - handle both DOMException and Error types
    if ((error instanceof DOMException && error.name === 'AbortError') ||
        (error instanceof Error && error.name === 'AbortError')) {
      if (callbacks.onUserCancelled) {
        callbacks.onUserCancelled('Request cancelled by user');
      }
      return;
    }

    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      console.error('Chat streaming error:', error);
    }
  }
};


// Process chat stream from orchestrator API
async function processChatStream(
  response: Response,
  callbacks: ChatStreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  if (!response.body) {
    throw new Error('Response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneReceived = false;

  try {
    while (true) {
      // Check if aborted before reading
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('Aborted', 'AbortError');
      }

      const { done, value } = await reader.read();

      if (done) {
        if (!doneReceived && callbacks.onDone) {
          callbacks.onDone('stream_end');
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // Skip [DONE] marker
        if (line.trim() === 'data: [DONE]') {
          if (!doneReceived && callbacks.onDone) {
            doneReceived = true;
            callbacks.onDone('done');
          }
          continue;
        }

        // Skip ping messages
        if (line.startsWith(': ping')) {
          continue;
        }

        if (line.startsWith('data: ')) {
          try {
            let jsonData = line.slice(6).trim();
            const event: StreamEvent = JSON.parse(jsonData);

            // Dispatch events based on type
            switch (event.type) {
              case 'iteration_start':
                if (callbacks.onIterationStart) {
                  callbacks.onIterationStart(event.iteration);
                }
                break;

              case 'text':
                if (callbacks.onText) {
                  callbacks.onText(event.content);
                }
                break;

              case 'reasoning_text':
                if (callbacks.onReasoningText) {
                  callbacks.onReasoningText(event.content);
                }
                break;

              case 'tool_call_start':
                if (callbacks.onToolCallStart) {
                  callbacks.onToolCallStart(event.tool, event.arguments, event.call_id);
                }
                break;

              case 'tool_approval_request':
                if (callbacks.onToolApprovalRequest) {
                  callbacks.onToolApprovalRequest(event.tool, event.arguments, event.call_id, event.message);
                }
                break;

              case 'tool_approved':
                if (callbacks.onToolApproved) {
                  callbacks.onToolApproved(event.tool, event.call_id, event.scope, event.message);
                }
                break;

              case 'tool_denied':
                if (callbacks.onToolDenied) {
                  callbacks.onToolDenied(event.tool, event.call_id, event.message);
                }
                break;

              case 'tool_redirected':
                if (callbacks.onToolRedirected) {
                  callbacks.onToolRedirected(event.tool, event.call_id, event.message, event.new_instruction);
                }
                break;

              case 'tool_timeout':
                if (callbacks.onToolTimeout) {
                  callbacks.onToolTimeout(event.tool, event.call_id, event.message);
                }
                break;

              case 'tool_call_end':
                if (callbacks.onToolCallEnd) {
                  callbacks.onToolCallEnd(event.tool, event.result, event.success, event.call_id);
                }
                break;

              case 'custom_component':
                if (callbacks.onCustomComponent) {
                  callbacks.onCustomComponent(event.component, event.props, event.call_id);
                }
                break;

              case 'plan_created':
                if (callbacks.onPlanCreated) {
                  callbacks.onPlanCreated(event.todos, event.todo_count, event.trace_id, event.call_id, event.timestamp);
                }
                break;

              case 'plan_updated':
                if (callbacks.onPlanUpdated) {
                  callbacks.onPlanUpdated(event.todos, event.todo_count, event.trace_id, event.call_id, event.timestamp);
                }
                break;

              case 'user_message_injected':
                if (callbacks.onUserMessageInjected) {
                  callbacks.onUserMessageInjected(event.message);
                }
                break;

              case 'user_cancelled':
                if (callbacks.onUserCancelled) {
                  callbacks.onUserCancelled(event.message);
                }
                break;

              case 'done':
                if (!doneReceived && callbacks.onDone) {
                  doneReceived = true;
                  callbacks.onDone(event.reason, event.message, event.tokens);
                }
                break;

              case 'error':
                if (callbacks.onError) {
                  callbacks.onError(event.error);
                }
                break;

              // OpenCode-style todo events
              case 'todo.created':
                if (callbacks.onTodoCreated) {
                  callbacks.onTodoCreated(event.todo, event.total_todos, event.session_id, event.call_id);
                }
                break;

              case 'todo.updated':
                if (callbacks.onTodoUpdated) {
                  callbacks.onTodoUpdated(event.todo, event.total_todos, event.session_id, event.call_id);
                }
                break;

              case 'todo.deleted':
                if (callbacks.onTodoDeleted) {
                  callbacks.onTodoDeleted(event.todo?.id, event.total_todos, event.session_id, event.call_id);
                }
                break;

              case 'todo.cleared':
                if (callbacks.onTodoCleared) {
                  callbacks.onTodoCleared(event.session_id, event.call_id);
                }
                break;

              case 'usage':
                if (callbacks.onUsage) {
                  callbacks.onUsage(event.tokens);
                }
                break;

              default:
                // Handle session_id and trace_id at root level (no type field)
                // The first event from backend contains both session_id and trace_id
                if (event.session_id && callbacks.onSessionId) {
                  callbacks.onSessionId(event.session_id);
                }
                if (event.trace_id && callbacks.onTraceId) {
                  callbacks.onTraceId(event.trace_id);
                }
                break;
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error, line);
          }
        }
      }
    }
  } catch (error) {
    // Check if error is due to abort - if so, don't call onError, let the outer catch handle it
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error; // Re-throw to be caught by outer try-catch
    }

    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      console.error('Chat stream processing error:', error);
    }
  } finally {
    reader.releaseLock();
  }
}
/**
 * Send a completion request that stores the conversation in the database
 */
export const completionStream = async (
  request: CompletionRequest,
  callbacks: ChatStreamCallbacks
): Promise<void> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request),
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Completion request failed with status: ${response.status}`);
    }

    await processChatStream(response, callbacks);
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      console.error('Completion streaming error:', error);
    }
  }
};


/**
 * Execute a kubectl command directly
 */
export const executeCommand = async (
  command: string,
  kubecontext?: string
): Promise<ExecuteCommandResponse> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ command, kubecontext })
  });

  if (!response.ok) {
    throw new Error(`Command execution failed with status: ${response.status}`);
  }

  return await response.json();
};

/**
 * List all conversations
 */
export const listConversations = async (
  skip = 0,
  limit = 100
): Promise<{ conversations: Conversation[], total: number }> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/conversations?skip=${skip}&limit=${limit}`);
  
  if (!response.ok) {
    throw new Error(`Failed to list conversations: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Create a new conversation
 */
export const createConversation = async (
  request: ConversationCreateRequest
): Promise<Conversation> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create conversation: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Get a conversation with its messages
 */
export const getConversation = async (
  conversationId: string
): Promise<ConversationWithMessages> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/conversations/${conversationId}`);
  
  if (!response.ok) {
    throw new Error(`Failed to get conversation: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Update a conversation's title
 */
export const updateConversation = async (
  conversationId: string,
  request: ConversationUpdateRequest
): Promise<Conversation> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/conversations/${conversationId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update conversation: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Delete a conversation
 */
export const deleteConversation = async (
  conversationId: string
): Promise<{ status: string, id: string }> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/conversations/${conversationId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    throw new Error(`Failed to delete conversation: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * HITL API Functions
 * 
 * Human-in-the-Loop system now applies globally to ALL function calls
 * when enabled. No function decorators are required - the system
 * intercepts function calls at the stream level.
 */

/**
 * Get current HITL status
 */
export const getHITLStatus = async (): Promise<HITLStatusResponse> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/hitl/status`);
  
  if (!response.ok) {
    throw new Error(`Failed to get HITL status: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Toggle HITL mode on/off
 */
export const toggleHITL = async (request: HITLToggleRequest): Promise<HITLToggleResponse> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/hitl/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to toggle HITL: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Submit user decision for HITL approval request
 */
export const submitHITLDecision = async (request: HITLDecisionRequest): Promise<HITLDecisionResponse> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/hitl/decision`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Approval request not found or expired');
    }
    throw new Error(`Failed to submit HITL decision: ${response.status}`);
  }
  
  return await response.json();
};

/**
 * Get all pending HITL approval requests
 */
export const getPendingHITLRequests = async (): Promise<HITLPendingRequestsResponse> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/hitl/pending`);

  if (!response.ok) {
    throw new Error(`Failed to get pending HITL requests: ${response.status}`);
  }

  return await response.json();
};

/**
 * Approve, deny, or redirect a tool call
 * Note: We pass sessionId here because the backend uses session_id as the key 
 * for APPROVAL_DECISIONS (not trace_id). The backend route still expects 
 * 'trace_id' as the field name for backward compatibility.
 */
export const approveToolCall = async (
  sessionId: string,
  callId: string,
  decision: 'approve' | 'deny' | 'approve_for_session' | 'redirect',
  message?: string
): Promise<void> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/chat/tool-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      trace_id: sessionId,  // Backend expects 'trace_id' but actually uses session_id as key
      call_id: callId,
      decision,
      message
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to ${decision} tool call: ${response.status}`);
  }
};