import React, { useRef, useEffect } from 'react';
import { Sparkles, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AutoResizeTextarea, ModelSelector } from '@/components/custom';
// Assuming these components are available in your project
// import { ResourceContext } from '@/components/custom';
// import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { ChatMessage } from '@/types/chat';
import UserMessage from './editorchat/user.message';
import AssistantMessage from './editorchat/assistant.message';

interface ChatPanelProps {
  // Chat state from parent
  question: string;
  setQuestion: (value: string) => void;
  chatResponse: string;
  isChatLoading: boolean;
  chatHistory: ChatMessage[];
  
  // Chat handlers from parent
  handleChatSubmit: (e: React.FormEvent | React.KeyboardEvent) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  question,
  setQuestion,
  chatResponse,
  isChatLoading,
  chatHistory,
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

  // Mock data for context files - you'd replace this with actual context
  // const contextFiles = [];
  
  // Mock for selected model - replace with actual state
  const selectedModel = "gpt-4o";
  const setSelectedModel = () => {};

  // Mock for resource context functions
  const handleAddContext = () => {};
  const handleInputFocus = () => {};
  const handleInputBlur = () => {};

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex-grow overflow-auto w-full
            scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
        {chatHistory.length === 0 ? (
          // Placeholder for empty state
          <div className="text-center px-10 py-8 flex-grow flex flex-col justify-center h-full">
            <Sparkles className="mx-auto h-8 w-8 text-gray-400 mb-2" />
            <h3 className="text-lg font-medium text-gray-700 dark:text-gray-200">Ask me about your YAML</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Get recommendations and best practices</p>

            <div className="space-y-2">
              {suggestedQuestions.map((item, index) => (
                <button
                  key={index}
                  className="flex items-center w-full p-2 text-left border border-gray-300 dark:border-gray-800/60 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/20 transition-colors"
                  onClick={() => handleQuestionClick(item.question)}
                >
                  <span className="mr-2">{item.icon}</span>
                  <span className="text-sm">{item.question}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm flex-grow flex flex-col justify-end">
            {chatHistory.map((message, index) => (
              <div key={index} className="flex items-start">
                {message.role === 'user' && (
                  <UserMessage content={message.content} /> 
                )}

                {message.role === 'assistant' && (
                  <AssistantMessage content={message.content} />
                )}
              </div>
            ))}

            {/* Streaming Animation */}
            {chatResponse && (
              <div className="flex items-start mb-4 w-full">
                <div className="bg-gray-300/50 dark:bg-gray-800/20 p-3 text-gray-800 dark:text-gray-300 w-full px-4">
                  <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mr-2 text-green-400">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    {chatResponse}
                    {isChatLoading && <span className="ml-1 animate-pulse">▋</span>}
                  </div>
                </div>
              </div>
            )}

            {isChatLoading && !chatResponse && (
              <div className="flex justify-center">
                <div className="p-2">
                  <span className="inline-block animate-bounce rounded-full h-2 w-2 bg-gray-500 mx-1"></span>
                  <span className="inline-block animate-bounce rounded-full h-2 w-2 bg-gray-500 mx-1" style={{ animationDelay: '0.2s' }}></span>
                  <span className="inline-block animate-bounce rounded-full h-2 w-2 bg-gray-500 mx-1" style={{ animationDelay: '0.4s' }}></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Chat Input - Using the style from RightDrawer */}
      <div className="border-t dark:border-gray-700/40 px-3 py-4 mt-auto">
        <div className="flex justify-between items-center mb-2">
          {/* Commented out because it likely depends on your project structure
          <ResourceContext onResourceSelect={handleAddContext} /> */}
          <div></div> {/* Placeholder for ResourceContext */}
          <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
        </div>


        <form onSubmit={handleChatSubmit} className="flex gap-2 items-center">
          <AutoResizeTextarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onSubmit={handleChatSubmit}
            placeholder="Ask about this YAML... (⌘L), @ to mention, ↑ to select"
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