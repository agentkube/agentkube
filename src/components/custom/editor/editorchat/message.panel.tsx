import React, { useRef, useEffect } from 'react';
import { Search, Sparkle, Sparkles } from "lucide-react";
import UserMessage from './user.message';
import AssistantMessage from './assistant.message';
import { ToolCall } from '@/api/orchestrator.chat';
import { ShiningText } from '@/components/ui/text-shining';

interface SuggestedQuestion {
  question: string;
  icon: React.ReactNode;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[]; // Add toolCalls to ChatMessage interface
}

interface MessagesProps {
  messages: ChatMessage[];
  currentResponse: string;
  currentToolCalls?: ToolCall[]; // Add currentToolCalls for streaming responses
  isLoading: boolean;
  onQuestionClick: (question: string) => void;
  suggestedQuestions: SuggestedQuestion[];
}

const Messages: React.FC<MessagesProps> = ({
  messages,
  currentResponse,
  currentToolCalls = [],
  isLoading,
  onQuestionClick,
  suggestedQuestions
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentResponse, currentToolCalls]);

  return (
    <div className="flex flex-col h-full">
      {messages.length === 0 ? (
        <div className="text-center px-10 py-8 flex-grow flex flex-col justify-center">
          <Sparkles className="mx-auto h-8 w-8 text-gray-400 mb-2" />
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-200">Ask me anything about the app</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Get help navigating or using features</p>

          <div className="space-y-2">
            {suggestedQuestions.map((item, index) => (
              <button
                key={index}
                className="flex items-center w-full p-2 text-left border border-gray-300 dark:border-gray-800/60 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/20 transition-colors"
                onClick={() => onQuestionClick(item.question)}
              >
                <span className="mr-2">{item.icon}</span>
                <span className="text-sm">{item.question}</span>
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
                  toolCalls={message.toolCalls} 
                /> 
              )}
            </div>
          ))}

          {/* Display current streaming response if available */}
          {isLoading && currentResponse && (
            <div className="flex items-start">
              <AssistantMessage 
                content={currentResponse} 
                toolCalls={currentToolCalls} 
              />
            </div>
          )}
          
          {/* Assistant isLoading response */}
          {isLoading && !currentResponse && !currentToolCalls.length && (
            <div className="flex justify-center">
              <div className="flex items-center space-x-2 p-6 bg-gray-300/30 dark:bg-gray-800/20 w-full">
                {/* <span className="inline-block animate-bounce rounded-full h-2 w-2 bg-gray-500 mx-1"></span>
                <span className="inline-block animate-bounce rounded-full h-2 w-2 bg-gray-500 mx-1" style={{ animationDelay: '0.2s' }}></span>
                <span className="inline-block animate-bounce rounded-full h-2 w-2 bg-gray-500 mx-1" style={{ animationDelay: '0.4s' }}></span> */}
                <Sparkles className='h-4 w-4 text-green-500 dark:text-gray-100/50 animate-pulse' />
                <ShiningText />
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