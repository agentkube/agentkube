import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AutoResizeTextarea, ModelSelector } from '@/components/custom';
// Assuming these components are available in your project
// import { ResourceContext } from '@/components/custom';
// import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { ChatMessage } from '@/types/chat';
import UserMessage from './editorchat/user.message';
import AssistantMessage from './editorchat/assistant.message';
import Messages from './editorchat/message.panel';

interface ChatPanelProps {
  // Chat state from parent
  question: string;
  setQuestion: (value: string) => void;
  chatResponse: string;
  isChatLoading: boolean;
  chatHistory: ChatMessage[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  
  // Chat handlers from parent
  handleChatSubmit: (e: React.FormEvent | React.KeyboardEvent) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  question,
  setQuestion,
  chatResponse,
  isChatLoading,
  chatHistory,
  selectedModel,
  onModelChange,
  handleChatSubmit
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatResponse]);

  // Suggested questions for empty state
  const suggestedQuestions = [
    {
      question: "How can I improve resource limits?",
      icon: <Sparkles className="w-4 h-4" />
    },
    {
      question: "What's wrong with my security context?",
      icon: <Sparkles className="w-4 h-4" />
    },
    {
      question: "How do I add health probes?",
      icon: <Sparkles className="w-4 h-4" />
    }
  ];

  const handleQuestionClick = (question: string) => {
    setQuestion(question);
  };

  // Mock for resource context functions
  const handleAddContext = () => {};
  const handleInputFocus = () => {};
  const handleInputBlur = () => {};

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-grow overflow-auto w-full
            
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
        <Messages
          messages={chatHistory}
          currentResponse={chatResponse}
          currentToolCalls={[]} // No tool calls in editor chat
          isLoading={isChatLoading}
          onQuestionClick={handleQuestionClick}
          suggestedQuestions={suggestedQuestions}
        />
      </div>
      
      {/* Chat Input - Using the style from RightDrawer */}
      <div className="border-t dark:border-gray-700/40 px-3 py-4 mt-auto">
        <div className="flex justify-between items-center mb-2">
          <div></div> {/* Placeholder for ResourceContext */}
          <ModelSelector selectedModel={selectedModel} onModelChange={onModelChange} />
        </div>
  
        <form onSubmit={handleChatSubmit} className="flex gap-2 items-center">
          <AutoResizeTextarea
            value={question}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQuestion(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onSubmit={handleChatSubmit}
            placeholder="Ask about this YAML... (⌘L)"
            disabled={isChatLoading}
            className="dark:border-transparent"
            autoFocus={true}  
          />
        </form>
      </div>
    </div>
  );
};

export default ChatPanel;