import { ChatMessage, TaskCalls, ThinkingStep } from "@/types/provision/chat";
import { AlignVerticalJustifyEnd, Cloud, MessageSquare, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import { UserMessage } from "./user-message.provisiondrawer";
import { AssistantMessage } from "./assistant-message.provisiondrawer";

interface MessagesProps {
  messages: ChatMessage[];
  currentResponse: string;
  isLoading: boolean;
  onParameterChange: (messageId: string, parameters: TaskCalls) => void;
  thinkingSteps?: ThinkingStep[];
  currentThinkingStep?: number;
  onSuggestionClick?: (suggestion: string) => void;
}

const suggestions = [
  "Set up a local Kind cluster",
  "Create a k3s cluster for edge computing",
  "Deploy a local minikube environment",
  "Create an EKS cluster for production workloads",
  "Set up an AKS cluster with monitoring enabled",
  "Deploy a GKE cluster with auto-scaling"
];

export const Messages: React.FC<MessagesProps> = ({ 
  messages, 
  currentResponse, 
  isLoading, 
  onParameterChange, 
  thinkingSteps, 
  currentThinkingStep,
  onSuggestionClick 
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentResponse, currentThinkingStep]);

  return (
    <div className="flex flex-col space-y-4">
      {messages.length === 0 && !isLoading && (
        <div className="text-center py-8 px-4">
          <AlignVerticalJustifyEnd className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
            Ready to Provision
          </h4>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Describe what infrastructure you'd like to provision and I'll help you configure it.
          </p>
          
          {/* Suggestion chips */}
          <div className="grid grid-cols-2 gap-2 justify-center min-w-lg mx-auto px-2">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="flex items-center space-x-1  px-2 py-1  text-xs bg-white dark:bg-transparent border border-gray-200 dark:border-gray-800 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-200 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600 cursor-pointer"
              >
                <MessageSquare className="dark:text-gray-600 h-5" /> 
                <p>{suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {messages.map((message, index) => (
        <div key={index}>
          {message.role === 'user' ? (
            <UserMessage content={message.content} />
          ) : (
            <AssistantMessage
              content={message.content}
              parameters={message.parameters}
              onParameterChange={(params) => onParameterChange(index.toString(), params)}
              completedThinkingSteps={message.completedThinkingSteps}
            />
          )}
        </div>
      ))}

      {/* Current streaming response */}
      {isLoading && (
        <AssistantMessage
          content={currentResponse || "Analyzing your request and generating infrastructure configuration..."}
          isStreaming={true}
          thinkingSteps={thinkingSteps}
          currentThinkingStep={currentThinkingStep}
        />
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};