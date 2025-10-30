import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { Hand, Search, Sparkle, Sparkles } from "lucide-react";
import UserMessage from './user-message.rightdrawer';
import AssistantMessage from './assistant-message.rightdrawer';
import { ToolCall } from '@/api/orchestrator.chat';
import { ShiningText } from '@/components/ui/text-shining';
import { AGENTKUBE } from '@/assets';
import { formatElapsedTime } from '@/utils/elapsedTime';

interface SuggestedQuestion {
  question: string;
  icon: React.ReactNode;
}

// Define stream events to maintain proper order
interface StreamEvent {
  type: 'text' | 'reasoning' | 'tool_start' | 'tool_approval' | 'tool_approved' | 'tool_denied' | 'tool_redirected' | 'tool_end';
  timestamp: number;
  textPosition?: number; // Position in text where this event occurred
  data: any;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  events?: StreamEvent[]; // Store sequential events
}

interface MessagesProps {
  messages: ChatMessage[];
  currentText: string;
  currentEvents?: StreamEvent[]; // Add currentEvents for streaming responses
  isLoading: boolean;
  onQuestionClick: (question: string) => void;
  suggestedQuestions: SuggestedQuestion[];
  elapsedTime?: number;
  onRetry?: (userMessage: string) => void;
}

const Messages: React.FC<MessagesProps> = ({
  messages,
  currentText,
  currentEvents = [],
  isLoading,
  onQuestionClick,
  suggestedQuestions,
  elapsedTime = 0,
  onRetry
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Debounced scroll to bottom function to prevent DOM thrashing
  const debouncedScrollToBottom = useCallback(() => {
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Only scroll when messages length changes or loading state changes, not on every content update
  useEffect(() => {
    debouncedScrollToBottom();
  }, [messages.length, isLoading, debouncedScrollToBottom]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to find the preceding user message for an assistant message
  const findUserMessageForAssistant = (assistantIndex: number): string | undefined => {
    // Look backwards from the assistant message index to find the preceding user message
    for (let i = assistantIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return undefined;
  };

  // Helper function to find the last user message (for streaming responses)
  const findLastUserMessage = (): string | undefined => {
    // Look backwards from the end to find the last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return undefined;
  };

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 ? (
        <div className="text-center px-10 py-8 flex-grow flex flex-col justify-center">

          {/* <Sparkles className="mx-auto h-8 w-8 text-emerald-500 mb-2" /> */}
          <h3 className="text-2xl font-medium text-gray-700 dark:text-gray-200 flex items-center mx-auto space-x-1.5"><Sparkles className='rotate-[-35deg] mr-1.5' />Hello! from <span className='text-emerald-500'>Agentkube</span></h3>
          <p className="text-md text-gray-500 dark:text-gray-400 mb-6">Let’s manage some pods.</p>

          <div className="grid grid-cols-2 gap-2 px-3">
            {suggestedQuestions.map((item, index) => (
              <button
                key={index}
                className="flex items-center w-full p-2 text-left border border-gray-300 dark:border-gray-800/60 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/20 transition-colors dark:text-gray-400"
                onClick={() => onQuestionClick(item.question)}
              >
                <span className="mr-2">{item.icon}</span>
                <span className="text-xs truncate">{item.question}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-sm flex-grow flex flex-col justify-end">
          {messages.map((message, index) => (
            <div key={index} className="flex items-start">
              {message.role === 'user' && (
                <UserMessage content={message.content} />
              )}

              {message.role === 'assistant' && (
                <AssistantMessage
                  content={message.content}
                  events={message.events}
                  onRetry={onRetry}
                  userMessage={findUserMessageForAssistant(index)}
                />
              )}
            </div>
          ))}

          {/* Display current streaming response if available */}
          {isLoading && (currentText || currentEvents.length > 0) && (
            <div className="flex items-start">
              <AssistantMessage
                content={currentText}
                events={currentEvents}
                onRetry={onRetry}
                userMessage={findLastUserMessage()}
                isStreaming={true}
              />
            </div>
          )}

          {/* Assistant isLoading response */}
          {isLoading && !currentText && currentEvents.length === 0 && (
            <div className="flex justify-center">
              <div className="flex items-center justify-between space-x-2 px-6 py-4 bg-gray-300/30 dark:bg-gray-800/20 w-full">
                <div className='flex items-center space-x-2'>
                  <Sparkles className='h-4 w-4 text-green-500 dark:text-gray-100/50 animate-pulse' />
                  <ShiningText />
                </div>
                <div className="ml-auto text-xs text-gray-500 dark:text-gray-400/40 font-mono">
                  {formatElapsedTime(elapsedTime)}
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}
    </div>
  );
}

export default Messages;