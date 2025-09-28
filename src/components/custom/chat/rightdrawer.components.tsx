import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { X, Search, BotMessageSquare, ArrowUp, ChevronLeft, Settings, MessageSquare, FileText } from "lucide-react";
import { useDrawer } from '@/contexts/useDrawer';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { AutoResizeTextarea, ChatSetting, ModelSelector, ResourceContext, ResourcePreview } from '@/components/custom';
import Messages from './main-assistant/message';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { EnrichedSearchResult, SearchResult } from '@/types/search';
import { drawerVariants, backdropVariants } from '@/utils/styles.utils';
import { motion, AnimatePresence } from 'framer-motion';
import { chatStream, executeCommand, ToolCall } from '@/api/orchestrator.chat';
import { useCluster } from '@/contexts/clusterContext';
import SignInContainer from './signin.component';
import UpgradeToProContainer from './upgradetopro.component';
import { useAuth } from '@/contexts/useAuth';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AgentkubeBot } from '@/assets/icons';
import PromptContentDialog from '@/components/custom/promptcontentdialog/promptcontentdialog.component';

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
    question: "What’s running inside the kube-system namespace?",
    icon: <Search className="w-4 h-4" />
  },
  {
    question: "How do I configure my Kubernetes settings?",
    icon: <Search className="w-4 h-4" />
  },
  {
    question: "How do I view all pods across namespaces?",
    icon: <Search className="w-4 h-4" />
  },
  {
    question: "What are the default roles and service accounts in a cluster?",
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
  const { isOpen, setIsOpen, resourceContextToAdd, clearResourceContextToAdd, structuredContentToAdd, clearStructuredContentToAdd } = useDrawer();
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
  const [showChatSettings, setShowChatSettings] = useState<boolean>(false);
  const [structuredContent, setStructuredContent] = useState<{content: string, title?: string}[]>([]);
  
  // Dialog states
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [selectedContentForDialog, setSelectedContentForDialog] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const { user } = useAuth();

  const [responseStartTime, setResponseStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isLoading && responseStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Date.now() - responseStartTime);
      }, 100);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isLoading, responseStartTime]);


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

  // Handle incoming resource context
  useEffect(() => {
    if (resourceContextToAdd) {
      handleAddContext(resourceContextToAdd);
      clearResourceContextToAdd();
    }
  }, [resourceContextToAdd, clearResourceContextToAdd]);

  // Handle incoming structured content
  useEffect(() => {
    if (structuredContentToAdd) {
      handleAddStructuredContent(structuredContentToAdd.content, structuredContentToAdd.title);
      clearStructuredContentToAdd();
    }
  }, [structuredContentToAdd, clearStructuredContentToAdd]);

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

    // Check if user is authenticated and block the request if not
    if (!user || !user.isAuthenticated) {
      // Add a message indicating they need to sign in
      setMessages(prev => [...prev,
      {
        role: 'user',
        content: inputValue
      },
      {
        role: 'assistant',
        content: '**Sign In Required** \n\nThis feature requires you to be signed in. Please sign in to continue using the AI assistant and access your free credits.'
      }
      ]);
      setInputValue('');
      return;
    }

    // Check if user has exceeded their usage limit
    if (user.usage_limit && (user.usage_count || 0) >= user.usage_limit) {
      // Add a message indicating they have exceeded their limit
      setMessages(prev => [...prev,
      {
        role: 'user',
        content: inputValue
      },
      {
        role: 'assistant',
        content: '**Usage Limit Exceeded** \n\nYou have reached your usage limit of ' + user.usage_limit + ' requests. Please upgrade your plan to continue using the AI assistant.'
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
    setStructuredContent([]);
    setIsLoading(true);
    setCurrentResponse('');
    setCurrentToolCalls([]);
    responseRef.current = '';
    toolCallsRef.current = [];
    setIsInputFocused(false);
    setResponseStartTime(Date.now());
    setElapsedTime(0);

    try {
      // Transform contextFiles to the format expected by the API
      const formattedFiles = contextFiles.map(file => ({
        resource_name: `${file.resourceType}/${file.resourceName}`,
        resource_content: file.resourceContent || ''
      }));

      // Add structured content as files
      const structuredContentFiles = structuredContent.map((item, index) => ({
        resource_name: `structured_content_${item.title || `item_${index + 1}`}`,
        resource_content: item.content
      }));

      const allFiles = [...formattedFiles, ...structuredContentFiles];

      await chatStream(
        {
          message: inputValue,
          chat_history: getRecentChatHistory(messages),
          model: selectedModel,
          kubecontext: currentContext?.name,
          files: allFiles.length > 0 ? allFiles : undefined,
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
            if (responseRef.current.trim() || toolCallsRef.current.length > 0) {
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: responseRef.current,
                  toolCalls: toolCallsRef.current.length > 0 ? [...toolCallsRef.current] : undefined
                }
              ]);
            }

            setCurrentResponse('');
            setCurrentToolCalls([]);
            setContextFiles([]);
            setIsLoading(false);
            setResponseStartTime(null);
          },
          onError: (error) => {
            console.error('Error in chat stream:', error);
            setIsLoading(false);

            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: `Something went wrong during the chat.`
              }
            ]);

            responseRef.current = '';
            toolCallsRef.current = [];
            setCurrentResponse('');
            setCurrentToolCalls([]);
            setContextFiles([]);
            setResponseStartTime(null);
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

  const handleAddStructuredContent = (content: string, title?: string): void => {
    // Add structured content to be used in chat
    const newTitle = title || `Paste${structuredContent.length + 1}`;
    setStructuredContent(prev => [...prev, { content, title: newTitle }]);
  };

  const handleMentionSelect = (item: any) => {
    console.log('Mentioned:', item.name);
    setMentions(prev => [...prev, item.name]);
  };

  const handleRetry = (userMessage: string) => {
    // Set the input value to the user message but don't submit it
    setInputValue(userMessage);
  };

  // Early return only after mounted check to avoid hydration issues
  if (!drawerMounted || !isOpen) return null;

  return (
    <TooltipProvider>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop with animation */}
            <motion.div
              className="fixed inset-0 bg-black/20 dark:bg-gray-900/40 z-40"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={backdropVariants}
              onClick={handleClose}
            />

            {/* Drawer with smooth animation */}
            <motion.div
              className="fixed top-0 right-0 h-full w-1/2 bg-gray-100 dark:bg-[#0B0D13]/60 backdrop-blur-lg  shadow-lg z-40"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants}
            >
              <div className="flex flex-col h-full">
                <div className="px-2 py-2 dark:bg-gray-800/20 flex items-center justify-between">
                  <div className='flex items-center space-x-2'>
                    {showChatSettings && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowChatSettings(false)}
                        className="p-1 text-gray-700 dark:text-gray-300"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back to Chat
                      </Button>
                    )}
                    {!showChatSettings && (
                      <>
                        <div>
                          {/* <img src={AGENTKUBE} alt="" className='h-6 ml-1 top-0.5 relative' /> */}
                          <div className='dark:bg-gray-700/20 p-1 rounded-md'>
                            <AgentkubeBot className='text-green-400 h-5 w-5' />
                          </div>
                        </div>
                        <h3 className="font-medium text-sm text-gray-800 dark:text-gray-200"><span className='text-gray-600 dark:text-gray-400/80'>Assistant</span> Talk to Cluster</h3>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-gray-800 dark:text-gray-500">
                    {!showChatSettings && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleClearChat}
                              className="p-1"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="p-1">
                            <p>Clear chat</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowChatSettings(true)}
                              className="p-1"

                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="p-1">
                            <p>Chat settings</p>
                          </TooltipContent>
                        </Tooltip>
                      </>
                    )}
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
    
    [&::-webkit-scrollbar]:w-1.5 
    [&::-webkit-scrollbar-track]:bg-transparent 
    [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
    [&::-webkit-scrollbar-thumb]:rounded-full
    [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
    overflow-auto transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-full'}`}
                >
                  {!showChatSettings ? (
                    <Messages
                      messages={messages}
                      currentResponse={currentResponse}
                      currentToolCalls={currentToolCalls}
                      isLoading={isLoading}
                      onQuestionClick={handleQuestionClick}
                      suggestedQuestions={suggestedQuestions}
                      elapsedTime={elapsedTime}
                      onRetry={handleRetry}
                    />
                  ) : (
                    <ChatSetting />
                  )}
                </div>

     
                {!showChatSettings && <SignInContainer />}
                {!showChatSettings && <UpgradeToProContainer />}


                {!showChatSettings && (
                  <div className="border-t dark:border-gray-700/40 px-3 py-4 mt-auto">
                    {structuredContent.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {structuredContent.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-center max-w-52 text-xs text-gray-700 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/20 border border-gray-300 dark:border-gray-700/30 rounded px-1 py-2"
                          >
                            <div
                              className="flex items-center cursor-pointer truncate max-w-44"
                              onClick={() => {
                                setSelectedContentForDialog(item.content);
                                setIsPromptDialogOpen(true);
                              }}
                            >
                              <FileText className="w-4 h-4" />
                              <span className="ml-1">{item.title}</span>
                            </div>
                            <X
                              size={12}
                              className="ml-1 cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStructuredContent(prev => prev.filter((_, i) => i !== index));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    
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
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
                        onFocus={handleInputFocus}
                        onBlur={handleInputBlur}
                        onSubmit={isLoading ? undefined : handleSubmit}
                        placeholder={isLoading ? "Waiting for response..." : "Ask anything (⌘L)"}
                        disabled={false}
                        className="dark:border-transparent"
                        autoFocus={true}
                        mentionItems={mentionData}
                        onMentionSelect={handleMentionSelect}
                      />

                      <div className="flex items-center justify-end">
                        <Button
                          type="submit"
                          disabled={isLoading || !inputValue.trim()}
                          className="p-3 h-2 w-2 rounded-full dark:text-black text-white bg-black dark:bg-white hover:dark:bg-gray-300"
                        >
                          <ArrowUp className='h-2 w-2' />
                        </Button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      
      {/* Prompt Content Dialog */}
      <PromptContentDialog
        isOpen={isPromptDialogOpen}
        onClose={() => setIsPromptDialogOpen(false)}
        content={selectedContentForDialog}
      />
    </TooltipProvider>
  );
};

export default RightDrawer;