/**
 * Session API - Chat session management for switching between historical conversations
 * OpenCode-style session management
 */

import { ORCHESTRATOR_URL } from '@/config';

// ============================================================================
// Types
// ============================================================================

export interface SessionTime {
  created: number;  // Unix timestamp
  updated: number;  // Unix timestamp
}

export interface SessionInfo {
  id: string;
  title: string;
  directory: string;
  status: 'idle' | 'busy' | 'completed';
  time: SessionTime;
  parent_id?: string;
  summary?: string;
  model?: string;
  message_count: number;
}

// ============================================================================
// Message Parts - OpenCode style part types for sequential content
// ============================================================================

export interface TextPart {
  type: 'text';
  id: string;
  content: string;
}

export interface ReasoningPart {
  type: 'reasoning';
  id: string;
  content: string;
}

export interface ToolPart {
  type: 'tool';
  id: string;
  call_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  state: 'pending' | 'running' | 'completed' | 'error' | 'denied' | 'redirected';
  result?: string;
  success?: boolean;
}

export interface TodoPart {
  type: 'todo';
  id: string;
  todo_id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
}

export type MessagePart = TextPart | ToolPart | ReasoningPart | TodoPart;

export interface MessageInfo {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;  // Full text content (for backward compatibility)
  parts?: MessagePart[];  // Parts array for proper ordering
  time: number;  // Unix timestamp
}

export interface SessionListResponse {
  sessions: SessionInfo[];
  count: number;
}

export interface SessionMessagesResponse {
  session_id: string;
  messages: MessageInfo[];
  count: number;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get the orchestrator base URL (removes /orchestrator suffix for API path construction)
 */
function getBaseUrl(): string {
  // ORCHESTRATOR_URL is like "http://localhost:4689/orchestrator"
  // We need "http://localhost:4689" for our API paths
  return ORCHESTRATOR_URL.replace('/orchestrator', '');
}

/**
 * List all chat sessions, sorted by last updated
 * @param limit Maximum number of sessions to return (1-100)
 */
export async function listSessions(limit: number = 50): Promise<SessionListResponse> {
  const url = `${getBaseUrl()}/orchestrator/api/session?limit=${limit}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sessions: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get a specific session by ID
 * @param sessionId Session ID to retrieve
 */
export async function getSession(sessionId: string): Promise<SessionInfo> {
  const url = `${getBaseUrl()}/orchestrator/api/session/${encodeURIComponent(sessionId)}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Create a new session
 * @param title Optional session title
 * @param model Optional model to use
 */
export async function createSession(title?: string, model?: string): Promise<SessionInfo> {
  let url = `${getBaseUrl()}/orchestrator/api/session`;
  const params = new URLSearchParams();
  if (title) params.append('title', title);
  if (model) params.append('model', model);
  if (params.toString()) url += `?${params.toString()}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Delete a session and all associated data
 * @param sessionId Session ID to delete
 */
export async function deleteSession(sessionId: string): Promise<{ success: boolean; message: string }> {
  const url = `${getBaseUrl()}/orchestrator/api/session/${encodeURIComponent(sessionId)}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to delete session: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get messages for a session
 * @param sessionId Session ID
 * @param limit Maximum messages to return (1-500)
 */
export async function getSessionMessages(sessionId: string, limit: number = 100): Promise<SessionMessagesResponse> {
  const url = `${getBaseUrl()}/orchestrator/api/session/${encodeURIComponent(sessionId)}/messages?limit=${limit}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch session messages: ${response.statusText}`);
  }

  return response.json();
}


export interface SessionTodosResponse {
  session_id: string;
  todos: any[];
  count: number;
}

/**
 * Get todos for a session
 * @param sessionId Session ID
 */
export async function getSessionTodos(sessionId: string): Promise<SessionTodosResponse> {
  const url = `${getBaseUrl()}/orchestrator/api/session/${encodeURIComponent(sessionId)}/todos`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch session todos: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Format a timestamp for display
 */
export function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);  // Convert from Unix timestamp
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
