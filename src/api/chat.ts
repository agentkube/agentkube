import { ChatMessage } from "@/types/chat";
import { getHeaders } from "@/utils/headers";

interface ChatRequest {
  message: string;
  accessType?: "READ_ONLY" | "READ_WRITE";
  chat_history?: ChatMessage[];
  query_context?: Array<{ command: string; output: string }> | string;
}

interface ChatResponse {
  response: string;
  context: Array<{
    pageContent: string;
    metadata: {
      source: string;
    };
  }>;
}

interface StreamEventData {
  type: "start" | "context" | "token" | "end" | "error";
  content: any;
}

export const chat = async (request: ChatRequest): Promise<ChatResponse> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Failed to send chat message");
  }

  return response.json();
};

export const chatStream = async (
  request: ChatRequest,
  callbacks: {
    onContext?: (context: ChatResponse["context"]) => void;
    onToken?: (token: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: string) => void;
  }
): Promise<void> => {
  const response = await fetch("/api/chat/stream", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Failed to initiate chat stream");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("Failed to create stream reader");
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const eventData: StreamEventData = JSON.parse(line.slice(6));

            switch (eventData.type) {
              case "context":
                callbacks.onContext?.(eventData.content);
                break;
              case "token":
                callbacks.onToken?.(eventData.content);
                break;
              case "end":
                callbacks.onComplete?.(eventData.content);
                break;
              case "error":
                callbacks.onError?.(eventData.content);
                break;
            }
          } catch (error) {
            console.error("Error parsing SSE data:", error);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};

export const testChatStream = async (
  request: ChatRequest,
  callbacks: {
    onContext?: (context: ChatResponse["context"]) => void;
    onToken?: (token: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: string) => void;
  }
): Promise<void> => {
  const response = await fetch("/api/chat/test-stream", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Failed to initiate test chat stream");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("Failed to create stream reader");
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const eventData: StreamEventData = JSON.parse(line.slice(6));

            switch (eventData.type) {
              case "context":
                callbacks.onContext?.(eventData.content);
                break;
              case "token":
                callbacks.onToken?.(eventData.content);
                break;
              case "end":
                callbacks.onComplete?.(eventData.content);
                break;
              case "error":
                callbacks.onError?.(eventData.content);
                break;
            }
          } catch (error) {
            console.error("Error parsing SSE data:", error);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};


interface ParseIntentRequest {
  message: string;
  accessType?: "READ_ONLY" | "READ_WRITE";
  chat_history?: ChatMessage[];
}

interface KubectlResponse {
  command: string;
  description: string;
}

export const getKubectlParsedIntent= async (request: ParseIntentRequest): Promise<KubectlResponse>  => {
  
    const response = await fetch('/api/chat/parse-intent', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      throw new Error("Failed to send chat message");
    }
    const data = await response.json();

    console.log(data)
    return data;
}


interface SecurityChatRequest extends ChatRequest {
  vulnerability_context?: {
    severity?: string;
    description?: string;
    code_snippet?: string;
  };
  manifest_content: string;
}

/**
 * Initiates a streaming chat session with the security analysis endpoint
 * for analyzing Kubernetes manifests for security vulnerabilities.
 * 
 * @param request Security chat request with manifest and vulnerability context
 * @param callbacks Callback functions for handling stream events
 */
export const securityChatStream = async (
  request: SecurityChatRequest,
  callbacks: {
    onContext?: (context: ChatResponse["context"]) => void;
    onToken?: (token: string) => void;
    onComplete?: (fullResponse: string) => void;
    onError?: (error: string) => void;
  }
): Promise<void> => {
  const response = await fetch("/api/chat/security/stream", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error("Failed to initiate security chat stream");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error("Failed to create stream reader");
  }

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const eventData: StreamEventData = JSON.parse(line.slice(6));

            switch (eventData.type) {
              case "context":
                callbacks.onContext?.(eventData.content);
                break;
              case "token":
                callbacks.onToken?.(eventData.content);
                break;
              case "end":
                callbacks.onComplete?.(eventData.content);
                break;
              case "error":
                callbacks.onError?.(eventData.content);
                break;
            }
          } catch (error) {
            console.error("Error parsing security stream data:", error);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
};
