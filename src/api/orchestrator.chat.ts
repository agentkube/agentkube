import { ORCHESTRATOR_URL } from "@/config";
import { fetch } from '@tauri-apps/plugin-http';
import { HITLApprovalRequest, HITLDecisionRequest, HITLDecisionResponse, HITLStatusResponse, HITLToggleRequest, HITLToggleResponse, HITLPendingRequestsResponse } from '@/types/hitl';
// Type definitions
export interface ChatRequest {
  message: string;
  chat_history?: ChatMessage[];
  model?: string;
  kubecontext?: string;
  prompt?: string;
  files?: FileContent[];
}

export interface CompletionRequest {
  message: string;
  conversation_id?: string;
  model?: string;
  kubecontext?: string;
  prompt?: string;
  files?: FileContent[];
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
  arguments: string;
  output?: {
    command: string;
    output: string;
  };
  isPending?: boolean;
}

// Stream callback types
export interface ChatStreamCallbacks {
  onStart?: (messageId: string, messageUuid: string) => void;
  onContentStart?: (index: number, block: any) => void;
  onContent?: (index: number, text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onHITLApprovalRequest?: (request: HITLApprovalRequest) => void;
  onComplete?: (reason: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Send a chat message to the orchestrator API with streaming response
 * This doesn't store the conversation in the database
 */
export const chatStream = async (
  request: ChatRequest,
  callbacks: ChatStreamCallbacks
): Promise<void> => {

  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request),
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Chat request failed with status: ${response.status}`);
    }

    await processChatStream(response, callbacks);
  } catch (error) {
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
  callbacks: ChatStreamCallbacks
): Promise<void> {
  if (!response.body) {
    throw new Error('Response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneReceived = false;
  
  // Keep track of pending tool calls to match with outputs
  const pendingToolCalls = new Map<string, ToolCall>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        if (!doneReceived && callbacks.onComplete) {
          callbacks.onComplete('stream_end');
        }
        break;
      }
      
      buffer += decoder.decode(value, { stream: true });
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        if (line.trim() === 'data: [DONE]') {
          if (!doneReceived && callbacks.onComplete) {
            doneReceived = true;
            callbacks.onComplete('done');
          }
          continue;
        }
        
        if (line.startsWith('data: ')) {
          try {
            let jsonData = line.slice(6);
            
            if (jsonData.startsWith('data: ')) {
              jsonData = jsonData.slice(6);
            }
            
            const data = JSON.parse(jsonData);
            
            // Handle HITL approval requests (HIGHEST PRIORITY)
            // When HITL is enabled, ALL function calls require approval
            if (data.hitl_approval_request && callbacks.onHITLApprovalRequest) {
              callbacks.onHITLApprovalRequest(data.hitl_approval_request);
              continue;
            }
            
            // Handle text content
            if (data.text && callbacks.onContent) {
              callbacks.onContent(0, data.text);
            }
            
            // Handle function call arguments
            if (data.function_call_args && callbacks.onContent) {
              callbacks.onContent(0, data.function_call_args);
            }
            
            // Handle tool calls - ONLY STORE, DON'T RENDER YET
            if (data.tool_call) {
              const toolCall: ToolCall = {
                tool: data.tool_call.tool,
                name: data.tool_call.name,
                arguments: data.tool_call.arguments
              };
              
              // Store pending tool call if it has a call_id
              if (data.tool_call.call_id) {
                pendingToolCalls.set(data.tool_call.call_id, toolCall);
              }
              
              // DON'T CALL callbacks.onToolCall here - wait for output
            }
            
            // Handle tool outputs - ONLY RENDER WHEN OUTPUT ARRIVES
            if (data.tool_output && data.tool_output.call_id && callbacks.onToolCall) {
              const pendingCall = pendingToolCalls.get(data.tool_output.call_id);
              if (pendingCall) {
                // Handle the output format correctly
                let outputString = "";
                let commandString = "";
                
                if (typeof data.tool_output.output === 'object' && data.tool_output.output !== null) {
                  commandString = data.tool_output.output.command || pendingCall.arguments;
                  outputString = data.tool_output.output.output || "";
                } else {
                  outputString = String(data.tool_output.output);
                  commandString = pendingCall.arguments;
                }
                
                // Create a complete tool call with output and render it
                const completeToolCall: ToolCall = {
                  ...pendingCall,
                  output: {
                    command: commandString,
                    output: outputString
                  }
                };
                
                // NOW call the callback with the complete tool call
                callbacks.onToolCall(completeToolCall);
                
                // Remove from pending calls
                pendingToolCalls.delete(data.tool_output.call_id);
              } else {
                console.warn(`No pending tool call found for call_id: ${data.tool_output.call_id}`);
              }
            }
            
            // Handle trace ID
            if (data.trace_id) {
              console.log(`Trace ID: ${data.trace_id}`);
            }
            
            // Handle errors
            if (data.error) {
              console.error('Stream error:', data.error);
              if (callbacks.onError) {
                callbacks.onError(new Error(data.error));
              }
            }
            
            // Handle done event
            if (data.done && !doneReceived) {
              doneReceived = true;
              if (callbacks.onComplete) {
                callbacks.onComplete('done');
              }
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error, line);
          }
        }
      }
    }
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      console.error('Chat stream processing error:', error);
    }
  } finally {
    reader.releaseLock();
    
    // Clean up any remaining pending tool calls
    if (pendingToolCalls.size > 0) {
      console.warn(`${pendingToolCalls.size} tool calls never received outputs`);
      pendingToolCalls.clear();
    }
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