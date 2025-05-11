import { ORCHESTRATOR_URL } from '@/config';

export interface VulnerabilityContext {
  severity?: string;
  description?: string;
  code_snippet?: string;
}

export interface SecurityRemediationRequest {
  message: string;
  manifest_content: string;
  vulnerability_context?: VulnerabilityContext;
  model?: string;
}

export interface StreamEventData {
  text?: string;
  error?: string;
  done?: boolean;
  trace_id?: string;
}

/**
 * Initiates a streaming security remediation session for Kubernetes manifests.
 * 
 * @param request Security remediation request with manifest and vulnerability context
 * @param callbacks Callback functions for handling stream events
 */
export const securityRemediationStream = async (
  request: SecurityRemediationRequest,
  callbacks: {
    onToken?: (token: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: string) => void;
  }
): Promise<void> => {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/security/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Failed to initiate security remediation stream: ${response.status} ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('Failed to create stream reader');
  }

  let fullResponse = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // The stream is done. Always call onComplete here to ensure it's triggered
        // even if the server never sent a "done" event
        callbacks.onComplete?.(fullResponse);
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            // The server returns nested data format, so we need to extract properly
            let jsonData = line.slice(6);
            
            // Handle the case where the server returns "data: data: {...}"
            if (jsonData.startsWith('data: ')) {
              jsonData = jsonData.slice(6);
            }
            
            const eventData: StreamEventData = JSON.parse(jsonData);

            if (eventData.text) {
              callbacks.onToken?.(eventData.text);
              fullResponse += eventData.text;
            }

            if (eventData.error) {
              callbacks.onError?.(eventData.error);
            }

            if (eventData.done) {
              callbacks.onComplete?.(fullResponse);
              // Don't return here, as we need to process all events
            }
          } catch (error) {
            console.error('Error parsing SSE data:', error, line);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};