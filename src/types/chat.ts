export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  command?: string;
}

export type AccessType = "READ_ONLY" | "READ_WRITE";

export interface SuggestionItem {
  title: string;
  description: string;
}