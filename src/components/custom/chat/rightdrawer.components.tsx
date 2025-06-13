import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, X, Search, Sparkles, Trash2, BotMessageSquare, Send, ArrowUp } from "lucide-react";
import { useDrawer } from '@/contexts/useDrawer';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { AutoResizeTextarea, ModelSelector, ResourceContext, ResourcePreview } from '@/components/custom';
import Messages from './main-assistant/message';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { EnrichedSearchResult, SearchResult } from '@/types/search';
import { drawerVariants, backdropVariants } from '@/utils/styles.utils';
import { motion, AnimatePresence } from 'framer-motion';
import { chatStream, executeCommand, ToolCall } from '@/api/orchestrator.chat';
import { useCluster } from '@/contexts/clusterContext';
import UpgradeToProContainer from './upgradepro.component';
import { useAuth } from '@/contexts/useAuth';

interface SuggestedQuestion {
  question: string;
  icon: React.ReactNode;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

const suggestedQuestions: SuggestedQuestion[] = [
  {
    question: "What does this application do?",
    icon: <Search className="w-4 h-4" />
  },
  {
    question: "How do I configure my Kubernetes settings?",
    icon: <Search className="w-4 h-4" />
  },
  {
    question: "Can you show me keyboard shortcuts for this app?",
    icon: <Search className="w-4 h-4" />
  }
];

// TODO: Make api call to get the available functions
const mentionData = [
  { id: 1, name: '', description: '' },
  // { id: 1, name: 'create_ticket', description: 'Create a ticket' },
  // { id: 2, name: 'create_task', description: 'Create a task' },
  // { id: 3, name: 'create_issue', description: 'Create an issue' },
  // { id: 4, name: 'create_project', description: 'Create a project' },
  // { id: 5, name: 'create_user', description: 'Create a user' },
  // { id: 6, name: 'create_customer', description: 'Create a customer' },
  // { id: 7, name: 'create_product', description: 'Create a product' },
];


const RightDrawer: React.FC = () => {
  const { isOpen, setIsOpen } = useDrawer();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [drawerMounted, setDrawerMounted] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-4o-mini');
  const [contextFiles, setContextFiles] = useState<EnrichedSearchResult[]>([]);
  const [previewResource, setPreviewResource] = useState<EnrichedSearchResult | null>(null);
  const { currentContext } = useCluster();
  const { user } = useAuth();

  // Conversation ID state to maintain session with the orchestrator
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  // Use a ref to accumulate streaming response
  const responseRef = useRef('');
  const toolCallsRef = useRef<ToolCall[]>([]);

  useEffect(() => {
    setDrawerMounted(true);
    return () => {
      setDrawerMounted(false);
    };
  }, []);

  useEffect(() => {
    console.log("Drawer isOpen state:", isOpen);
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleResourcePreview = (resource: EnrichedSearchResult) => {
    setPreviewResource(resource);
  };

  const handleClose = (): void => {
    try {
      setIsClosing(true);
      setTimeout(() => {
        setIsOpen(false);
        setIsClosing(false);
      }, 300);
    } catch (error) {
      console.error("Error closing drawer:", error);
      setIsOpen(false);
      setIsClosing(false);
    }
  };

  const handleClearChat = (): void => {
    setMessages([]);
    setInputValue('');
    setCurrentResponse('');
    setCurrentToolCalls([]);
    setConversationId(undefined);
  };

  const getRecentChatHistory = (messages: ChatMessage[], maxMessages: number = 5) => {
    return messages.slice(-maxMessages).map(msg => ({
      role: msg.role,
      content: msg.content
    }));
  };

  const handleSubmit = async (e: React.FormEvent | React.KeyboardEvent): Promise<void> => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
  
    // Check if user is on free version and block the request
    if (!user || !user.isLicensed || user.subscription.status !== 'active') {
      // Add a message indicating they need to upgrade
      setMessages(prev => [...prev, 
        {
          role: 'user',
          content: inputValue
        },
        {
          role: 'assistant',
          content: '**Upgrade Required** \n\nThis feature requires a Pro subscription. Please upgrade to continue using the AI assistant.'
        }
      ]);
      setInputValue('');
      return;
    }
  
    const userMessage: ChatMessage = {
      role: 'user',
      content: inputValue
    };
  
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setCurrentResponse('');
    setCurrentToolCalls([]);
    responseRef.current = '';
    toolCallsRef.current = [];
    setIsInputFocused(false);
  
    try {
      // Transform contextFiles to the format expected by the API
      const formattedFiles = contextFiles.map(file => ({
        resource_name: `${file.resourceType}/${file.resourceName}`,
        resource_content: file.resourceContent || ''
      }));
  
      await chatStream(
        {
          message: inputValue,
          chat_history: getRecentChatHistory(messages),
          model: selectedModel,
          kubecontext: currentContext?.name,
          files: formattedFiles.length > 0 ? formattedFiles : undefined,
        },
        {
          onStart: (messageId, messageUuid) => {
            console.log(`Message started: ${messageId}`);
          },
          onContent: (index, text) => {
            responseRef.current += text;
            setCurrentResponse(responseRef.current);
          },
          onToolCall: (toolCall) => {
            toolCallsRef.current = [...toolCallsRef.current, toolCall];
            setCurrentToolCalls([...toolCallsRef.current]);
          },
          onComplete: (reason) => {
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: responseRef.current,
                toolCalls: toolCallsRef.current.length > 0 ? [...toolCallsRef.current] : undefined
              }
            ]);
  
            setCurrentResponse('');
            setCurrentToolCalls([]);
            setContextFiles([]);
            setIsLoading(false);
          },
          onError: (error) => {
            console.error('Error in chat stream:', error);
            setIsLoading(false);
  
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: `${'Something went wrong during the chat.'}`
              }
            ]);
          }
        }
      );
  
      // Check if the input starts with 'kubectl' to execute as a command
      if (inputValue.trim().startsWith('kubectl')) {
        await handleKubectlCommand(inputValue.trim());
      }
    } catch (error) {
      console.error('Failed to process message:', error);
      setIsLoading(false);
  
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`
        }
      ]);
    }
  };

  // Helper function to handle kubectl commands
  const handleKubectlCommand = async (command: string): Promise<void> => {
    if (!currentContext) return;
    try {
      // Add user command message if not already added
      setMessages(prev => [
        ...prev.filter(m => m.role !== 'user' || m.content !== command),
        {
          role: 'user',
          content: `Execute: \`${command}\``
        }
      ]);

      // Execute the command with analysis
      const result = await executeCommand(command, currentContext.name);

      // Add the result to messages
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: result.success
            ? `**Command executed:**\n\`\`\`\n${result.output}\n\`\`\`\n`
            : `**Command failed:**\n\`\`\`\n${result.output || 'No output'}\n\`\`\`\n`
        }
      ]);
    } catch (error) {
      console.error('Failed to execute command:', error);

      // Add error message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error executing command: ${error instanceof Error ? error.message : String(error)}`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuestionClick = (question: string): void => {
    setInputValue(question);
  };

  const handleInputFocus = (): void => {
    if (messages.length === 0) {
      setIsInputFocused(true);
    }
  };

  const handleInputBlur = (): void => {
    // Keep it visible once shown
  };

  const handleAddContext = (resource: SearchResult): void => {
    // Add context files to be used in chat
    setContextFiles(prev => [
      ...prev.filter(r =>
        !(r.resourceName === resource.resourceName &&
          r.resourceType === resource.resourceType &&
          r.namespace === resource.namespace)
      ),
      resource
    ]);
  };

  const handleMentionSelect = (item: any) => {
    console.log('Mentioned:', item.name);
    setMentions(prev => [...prev, item.name]);
  };

  // Early return only after mounted check to avoid hydration issues
  if (!drawerMounted || !isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with animation */}
          <motion.div
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={backdropVariants}
            onClick={handleClose}
          />

          {/* Drawer with smooth animation */}
          <motion.div
            className="fixed top-0 right-0 h-full w-1/2 bg-gray-100 dark:bg-[#0B0D13] shadow-lg z-40"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={drawerVariants}
          >
            <div className="flex flex-col h-full">
              <div className="p-4 border-b dark:border-gray-700/30 flex items-center justify-between">
                <div className='flex items-center space-x-2'>
                  <Sparkles className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  <h3 className="font-medium text-md text-gray-800 dark:text-gray-200">Assistant: Talk to Cluster</h3>
                </div>
                <div className="flex items-center gap-2 text-gray-800 dark:text-gray-500">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearChat}
                    className="p-1"
                    title="Clear chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1"
                  >
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    className="p-1"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
         

              <div
                className={`flex-grow 
                  scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
                  [&::-webkit-scrollbar]:w-1.5 
                  [&::-webkit-scrollbar-track]:bg-transparent 
                  [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                  [&::-webkit-scrollbar-thumb]:rounded-full
                  [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
                  overflow-auto transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-full'}`}
              >
                <Messages
                  messages={messages}
                  currentResponse={currentResponse}
                  currentToolCalls={currentToolCalls}
                  isLoading={isLoading}
                  onQuestionClick={handleQuestionClick}
                  suggestedQuestions={suggestedQuestions}
                />
              </div>

              {isInputFocused && messages.length === 0 && (
                <motion.div
                  className='px-8 py-4 bg-gray-200 dark:bg-[#18181b]'
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-3">
                    <BotMessageSquare className="h-4 w-4 text-gray-700 dark:text-gray-300 mb-2" />
                    <TextGenerateEffect
                      words="How can I assist you with your Kubernetes cluster today? Feel free to ask me anything about your application or infrastructure."
                      className="text-sm"
                      duration={0.8}
                    />
                  </div>
                </motion.div>
              )}


              <UpgradeToProContainer />


              <div className="border-t dark:border-gray-700/40 px-3 py-4 mt-auto">
                <div className="flex justify-between items-center mb-2">
                  <ResourceContext onResourceSelect={handleAddContext} />
                  <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
                </div>

                {contextFiles.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1 relative">
                    {contextFiles.map(file => (
                      <div
                        key={file.resourceName}
                        className="flex items-center text-xs bg-gray-100 dark:bg-gray-800/20 border border-gray-300 dark:border-gray-800 rounded px-2 py-0.5"
                      >
                        <div
                          className="flex items-center cursor-pointer"
                          onClick={() => handleResourcePreview(file)}
                        >
                          <img src={KUBERNETES_LOGO} className="w-4 h-4" alt="Kubernetes logo" />
                          <span className="ml-1">{file.resourceName}</span>
                        </div>
                        <X
                          size={12}
                          className="ml-1 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            setContextFiles(prev => prev.filter(f => f.resourceName !== file.resourceName));
                          }}
                        />
                      </div>
                    ))}

                    {previewResource && (
                      <ResourcePreview
                        resource={previewResource}
                        onClose={() => setPreviewResource(null)}
                      />
                    )}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex gap-2 items-baseline">
                  <AutoResizeTextarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onSubmit={handleSubmit}
                    placeholder="Ask anything (⌘L)"
                    disabled={isLoading}
                    className="dark:border-transparent"
                    autoFocus={true}
                    mentionItems={mentionData}
                    onMentionSelect={handleMentionSelect}
                  />


                  <div className="flex items-center justify-end">
                    <Button
                      type="submit"
                      disabled={isLoading || !inputValue.trim()}
                      className="p-3 h-2 w-2 rounded-full dark:bg-gray-800/60"
                    >
                      <ArrowUp className='h-2 w-2' />
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default RightDrawer;