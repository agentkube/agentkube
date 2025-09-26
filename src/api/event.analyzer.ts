import { ORCHESTRATOR_URL } from "@/config";
import { fetch } from '@tauri-apps/plugin-http';

// Type definitions for event analysis
export interface EventAnalysisRequest {
  event: any; // Kubernetes event object
  cluster_name: string;
  model?: string;
  kubecontext?: string;
}

// Stream callback types
export interface EventAnalysisStreamCallbacks {
  onStart?: (messageId: string, messageUuid: string) => void;
  onContentStart?: (index: number, block: any) => void;
  onContent?: (index: number, text: string) => void;
  onToolCall?: (toolCall: any) => void;
  onComplete?: (reason: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Send an event analysis request to the orchestrator API with streaming response
 */
export const analyzeEventStream = async (
  request: EventAnalysisRequest,
  callbacks: EventAnalysisStreamCallbacks
): Promise<void> => {

  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/analyze/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify(request),
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Event analysis request failed with status: ${response.status}`);
    }

    await processEventAnalysisStream(response, callbacks);
  } catch (error) {
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    } else {
      console.error('Event analysis streaming error:', error);
    }
  }
};

// Process event analysis stream from orchestrator API
async function processEventAnalysisStream(
  response: Response,
  callbacks: EventAnalysisStreamCallbacks
): Promise<void> {
  if (!response.body) {
    throw new Error('Response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneReceived = false;
  
  // Keep track of pending tool calls to match with outputs
  const pendingToolCalls = new Map<string, any>();

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
              const toolCall = {
                tool: data.tool_call.tool,
                name: data.tool_call.name,
                arguments: data.tool_call.arguments
              };
              
              // Store pending tool call if it has a call_id
              if (data.tool_call.call_id) {
                pendingToolCalls.set(data.tool_call.call_id, toolCall);
              }
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
                const completeToolCall = {
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
      console.error('Event analysis stream processing error:', error);
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