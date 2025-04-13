import { ORCHESTRATOR_URL } from "@/config";

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
  title: string;
  content: string;
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
  command: Record<string, any>;
  output: string;
}

// Stream callback types
export interface ChatStreamCallbacks {
  onStart?: (messageId: string, messageUuid: string) => void;
  onContentStart?: (index: number, block: any) => void;
  onContent?: (index: number, text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
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
      body: JSON.stringify(request)
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
  // Keep track of the last tool call to associate with outputs
  let lastToolName = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      // Decode the chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });
      
      // Process complete lines
      const lines = buffer.split('\n');
      // Keep the last potentially incomplete line
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Handle the double "data: data:" format from your API
        if (line.startsWith('data: data: ')) {
          const dataString = line.substring(12); // Remove 'data: data: ' prefix
          
          try {
            const data = JSON.parse(dataString);
            
            // Handle text content
            if (data.text && callbacks.onContent) {
              callbacks.onContent(0, data.text);
            }
            
            // Handle tool calls
            if (data.tool_call  && callbacks.onToolCall ) {
              const toolCall: ToolCall = {
                tool: data.tool_call.tool,
                command: { command: data.tool_call.command },
                output: data.tool_call.output
              };
              callbacks.onToolCall(toolCall);
            }
            
            // // Handle tool outputs - this is the format your backend is sending
            if (data.tool_output && callbacks.onToolCall) {
              // Create a proper ToolCall object matching your interface
              const toolCall: ToolCall = {
                tool: lastToolName,
                command: { command: data.tool_output.command },
                output: data.tool_output.output
              };
              callbacks.onToolCall(toolCall);
            }
            
            // Handle trace ID
            if (data.trace_id) {
              console.log(`Trace ID: ${data.trace_id}`);
            }
            
            // Handle completion event
            if (data.done === true && !doneReceived) {
              doneReceived = true;
              if (callbacks.onComplete) {
                callbacks.onComplete('done');
              }
            }
          } catch (error) {
            console.error('Error parsing event data:', error, dataString);
          }
        }
      }
    }
    
    // If we haven't received a done event yet, call onComplete
    if (!doneReceived && callbacks.onComplete) {
      callbacks.onComplete('stream_end');
    }
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      console.error('Chat stream processing error:', error);
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
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error(`Completion request failed with status: ${response.status}`);
    }

    await processEventStream(response, callbacks);
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      console.error('Completion streaming error:', error);
    }
  }
};

// Process event stream and trigger callbacks
async function processEventStream(
  response: Response,
  callbacks: ChatStreamCallbacks
): Promise<void> {
  if (!response.body) {
    throw new Error('Response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completionCalled = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete events in the buffer
    const events = buffer.split('data: \n\ndata: ');
    
    // Keep the last potentially incomplete event in the buffer
    if (events.length > 1) {
      buffer = events.pop() || '';
      
      // Process each complete event
      for (const event of events) {
        processEventData(event, callbacks, completionCalled);
      }
    }
  }

  // Process any remaining data in the buffer
  if (buffer) {
    processEventData(buffer, callbacks, completionCalled);
  }
}

// Helper function to process event data from the stream
function processEventData(
  eventData: string, 
  callbacks: ChatStreamCallbacks,
  completionCalled: boolean
): void {
  const lines = eventData.split('\n');
  let currentEventType = '';
  let currentEventData = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.startsWith('data: event: ')) {
      currentEventType = line.substring(12).trim();
      // Look for the corresponding data line (should be the next line)
      if (i + 1 < lines.length && lines[i + 1].startsWith('data: data: ')) {
        currentEventData = lines[i + 1].substring(11).trim();
        
        try {
          const parsedData = JSON.parse(currentEventData);
          
          // Process the event based on its type
          switch (currentEventType) {
            case 'message_start':
              if (callbacks.onStart && parsedData.message) {
                callbacks.onStart(parsedData.message.id, parsedData.message.uuid);
              }
              break;
            
            case 'content_block_start':
              if (callbacks.onContentStart) {
                callbacks.onContentStart(parsedData.index, parsedData.content_block);
              }
              break;
            
            case 'content_block_delta':
              if (callbacks.onContent && parsedData.delta && parsedData.delta.text) {
                callbacks.onContent(parsedData.index, parsedData.delta.text);
              }
              break;
            
            case 'tool_call':
              // Handle tool call events
              if (callbacks.onToolCall) {
                const toolCall: ToolCall = {
                  tool: parsedData.tool,
                  command: parsedData.command || {},
                  output: parsedData.output || ''
                };
                callbacks.onToolCall(toolCall);
              }
              break;
            
            case 'message_delta':
              if (callbacks.onComplete && !completionCalled && parsedData.delta && parsedData.delta.stop_reason) {
                callbacks.onComplete(parsedData.delta.stop_reason);
                completionCalled = true;
              }
              break;
            
            case 'message_stop':
              if (callbacks.onComplete && !completionCalled) {
                callbacks.onComplete('message_stop');
                completionCalled = true;
              }
              break;
              
            default:
              console.log(`Unhandled event type: ${currentEventType}`, parsedData);
          }
        } catch (error) {
          console.error('Error parsing event data:', error, currentEventData);
        }
        
        // Skip the data line since we've already processed it
        i++;
      }
    }
  }
}

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