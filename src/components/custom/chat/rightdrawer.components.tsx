import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { X, Search, BotMessageSquare, ArrowUp, ChevronLeft, Settings, MessageSquare, FileText, ShieldCheck, ShieldAlert, Square, Pause, Image, AppWindow } from "lucide-react";
import { useDrawer } from '@/contexts/useDrawer';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { AutoResizeTextarea, ChatSetting, ModelSelector, ResourceContext, ResourceContextSuggestion, ResourcePreview, ReasoningEffort, ReasoningEffortLevel } from '@/components/custom';
import Messages from './main-assistant/message';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { EnrichedSearchResult, SearchResult } from '@/types/search';
import { drawerVariants, backdropVariants } from '@/utils/styles.utils';
import { motion, AnimatePresence } from 'framer-motion';
import { chatStream, executeCommand, ToolCall, TodoItem } from '@/api/orchestrator.chat';
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
import { ToolPermissionPrompt } from './toolpermissionprompt.rightdrawer';
import { TodoProgressIndicator } from './todoprogressindicator.rightdrawer';
import { toast } from '@/hooks/use-toast';

interface SuggestedQuestion {
  question: string;
  icon: React.ReactNode;
}

// Define stream events to maintain proper order
interface StreamEvent {
  type: 'text' | 'reasoning' | 'tool_start' | 'tool_approval' | 'tool_approved' | 'tool_denied' | 'tool_redirected' | 'tool_end' | 'custom_component' | 'plan_created' | 'plan_updated';
  timestamp: number;
  textPosition?: number; // Position in text where this event occurred
  data: any;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  events?: StreamEvent[]; // Store sequential events
}

const suggestedQuestions: SuggestedQuestion[] = [
  {
    question: "What's running inside the kube-system namespace?",
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
];


const RightDrawer: React.FC = () => {
  const { isOpen, setIsOpen, resourceContextToAdd, clearResourceContextToAdd, structuredContentToAdd, clearStructuredContentToAdd } = useDrawer();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentEvents, setCurrentEvents] = useState<StreamEvent[]>([]);
  const [currentText, setCurrentText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [currentTodos, setCurrentTodos] = useState<TodoItem[]>([]);
  const [persistedTodos, setPersistedTodos] = useState<TodoItem[]>([]);
  const [showTodoProgress, setShowTodoProgress] = useState<boolean>(false);
  const [drawerMounted, setDrawerMounted] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-4o-mini');
  const [autoApprove, setAutoApprove] = useState<boolean>(false);
  const [contextFiles, setContextFiles] = useState<EnrichedSearchResult[]>([]);
  const [previewResource, setPreviewResource] = useState<EnrichedSearchResult | null>(null);
  const [showChatSettings, setShowChatSettings] = useState<boolean>(false);
  const [structuredContent, setStructuredContent] = useState<{ content: string, title?: string }[]>([]);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffortLevel>('medium');

  // Dialog states
  const [isPromptDialogOpen, setIsPromptDialogOpen] = useState(false);
  const [selectedContentForDialog, setSelectedContentForDialog] = useState<string | null>(null);

  // Tool permission state
  const [pendingToolApproval, setPendingToolApproval] = useState<{
    tool: string;
    args: any;
    callId: string;
    message: string;
  } | null>(null);

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

  // Use refs to track current streaming state
  const eventsRef = useRef<StreamEvent[]>([]);
  const textRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);

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
    const handleKeyboard = (e: KeyboardEvent) => {
      // Handle Escape key
      if (e.key === 'Escape') {
        handleClose();
      }

      // Handle Ctrl + Tab to toggle autoApprove
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault(); // Prevent default tab behavior
        setAutoApprove(prev => !prev);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyboard);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyboard);
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
    setCurrentEvents([]);
    setCurrentText('');
    setConversationId(undefined);
    setPendingToolApproval(null);
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
      setMessages(prev => [...prev,
      {
        role: 'user',
        content: inputValue
      },
      {
        role: 'assistant',
        content: '**Sign In Required** \n\nThis feature requires you to be signed in. Please sign in to continue using the AI assistant and access your free credits.',
        events: []
      }
      ]);
      setInputValue('');
      return;
    }

    // Check if user has exceeded their usage limit
    if (user.usage_limit && (user.usage_count || 0) >= user.usage_limit) {
      setMessages(prev => [...prev,
      {
        role: 'user',
        content: inputValue
      },
      {
        role: 'assistant',
        content: '**Usage Limit Exceeded** \n\nYou have reached your usage limit of ' + user.usage_limit + ' requests. Please upgrade your plan to continue using the AI assistant.',
        events: []
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
    setCurrentEvents([]);
    setCurrentText('');
    eventsRef.current = [];
    textRef.current = '';
    setIsInputFocused(false);
    setResponseStartTime(Date.now());
    setElapsedTime(0);

    // Create new AbortController for this request
    abortControllerRef.current = new AbortController();

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
          ...(autoApprove && { auto_approve: true }),
          reasoning_effort: reasoningEffort, // TODO: Remove this comment when backend implementation is done
        },
        {
          onTraceId: (traceId) => {
            console.log('Trace ID:', traceId);
            setCurrentTraceId(traceId);
          },
          onIterationStart: (iteration) => {
            console.log('Iteration:', iteration);
          },
          onText: (text) => {
            // Accumulate text content
            textRef.current += text;
            setCurrentText(textRef.current);
          },
          onReasoningText: (text) => {
            // For now, treat reasoning text same as regular text
            textRef.current += text;
            setCurrentText(textRef.current);
          },
          onToolCallStart: (tool, args, callId) => {
            const event: StreamEvent = {
              type: 'tool_start',
              timestamp: Date.now(),
              textPosition: textRef.current.length, // Capture current text length
              data: { tool, args, callId }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);
          },
          onToolApprovalRequest: (tool, args, callId, message) => {
            const event: StreamEvent = {
              type: 'tool_approval',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { tool, args, callId, message }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);

            // Show approval prompt
            setPendingToolApproval({ tool, args, callId, message });
          },
          onToolApproved: (tool, callId, scope, message) => {
            const event: StreamEvent = {
              type: 'tool_approved',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { tool, callId, scope, message }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);

            // Hide approval prompt
            setPendingToolApproval(null);
          },
          onToolDenied: (tool, callId, message) => {
            const event: StreamEvent = {
              type: 'tool_denied',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { tool, callId, message }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);

            // Hide approval prompt
            setPendingToolApproval(null);
          },
          onToolRedirected: (tool, callId, message, newInstruction) => {
            const event: StreamEvent = {
              type: 'tool_redirected',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { tool, callId, message, newInstruction }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);

            // Hide approval prompt
            setPendingToolApproval(null);
          },
          onToolCallEnd: (tool, result, success, callId) => {
            const event: StreamEvent = {
              type: 'tool_end',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { tool, result, success, callId }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);
          },
          onCustomComponent: (component, props, callId) => {
            const event: StreamEvent = {
              type: 'custom_component',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { component, props, callId }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);
          },
          onPlanCreated: (todos, todoCount, traceId, callId, timestamp) => {
            console.log('Plan created:', todos);
            setCurrentTodos(todos);
            setPersistedTodos(todos);
            setShowTodoProgress(true);

            const event: StreamEvent = {
              type: 'plan_created',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { todos, todoCount, traceId, callId, timestamp }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);
          },
          onPlanUpdated: (todos, todoCount, traceId, callId, timestamp) => {
            console.log('Plan updated:', todos);
            setCurrentTodos(todos);
            setPersistedTodos(todos);

            const event: StreamEvent = {
              type: 'plan_updated',
              timestamp: Date.now(),
              textPosition: textRef.current.length,
              data: { todos, todoCount, traceId, callId, timestamp }
            };
            eventsRef.current = [...eventsRef.current, event];
            setCurrentEvents([...eventsRef.current]);
          },
          // OpenCode-style todo event handlers
          onTodoCreated: (todo, totalTodos, sessionId, callId) => {
            console.log('Todo created:', todo);
            setPersistedTodos(prev => {
              // Add new todo, avoid duplicates
              const exists = prev.some(t => t.id === todo.id);
              if (exists) return prev;
              return [...prev, todo];
            });
            setShowTodoProgress(true);
          },
          onTodoUpdated: (todo, totalTodos, sessionId, callId) => {
            console.log('Todo updated:', todo);
            setPersistedTodos(prev =>
              prev.map(t => t.id === todo.id ? { ...t, ...todo } : t)
            );
          },
          onTodoDeleted: (todoId, remainingTodos, sessionId, callId) => {
            console.log('Todo deleted:', todoId);
            setPersistedTodos(prev => prev.filter(t => t.id !== todoId));
          },
          onTodoCleared: (sessionId, callId) => {
            console.log('Todos cleared');
            setPersistedTodos([]);
            setShowTodoProgress(false);
          },
          onUserMessageInjected: (message) => {
            console.log('User message injected:', message);
          },
          onUserCancelled: (message) => {
            // Save partial response if any
            if (textRef.current.trim() || eventsRef.current.length > 0) {
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: textRef.current + '\n\n*[Response cancelled by user]*',
                  events: [...eventsRef.current]
                }
              ]);
            }

            // Clean up state
            setCurrentText('');
            setCurrentEvents([]);
            setContextFiles([]);
            setIsLoading(false);
            setResponseStartTime(null);
            setPendingToolApproval(null);
            setCurrentTraceId(null);
            abortControllerRef.current = null;
          },
          onDone: (reason, message) => {
            if (textRef.current.trim() || eventsRef.current.length > 0) {
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: textRef.current,
                  events: [...eventsRef.current]
                }
              ]);
            }

            setCurrentText('');
            setCurrentEvents([]);
            setContextFiles([]);
            setIsLoading(false);
            setResponseStartTime(null);
            setPendingToolApproval(null);
            setCurrentTraceId(null);
          },
          onError: (error) => {
            // Check if this is a cancellation error (backend sends "Request cancelled" as error message)
            const errorMessage = typeof error === 'string' ? error : error.message;
            if (errorMessage === 'Request cancelled') {
              // Save partial response if any
              if (textRef.current.trim() || eventsRef.current.length > 0) {
                setMessages(prev => [
                  ...prev,
                  {
                    role: 'assistant',
                    content: textRef.current + '\n\n*[Response cancelled by user]*',
                    events: [...eventsRef.current]
                  }
                ]);
              }

              // Clean up state
              setCurrentText('');
              setCurrentEvents([]);
              setContextFiles([]);
              setIsLoading(false);
              setResponseStartTime(null);
              setPendingToolApproval(null);
              setCurrentTraceId(null);
              abortControllerRef.current = null;
              return;
            }

            // This is a real error, show error message
            console.error('Error in chat stream:', error);
            setIsLoading(false);

            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: `Something went wrong during the chat.`,
                events: []
              }
            ]);

            textRef.current = '';
            eventsRef.current = [];
            setCurrentText('');
            setCurrentEvents([]);
            setContextFiles([]);
            setResponseStartTime(null);
            setPendingToolApproval(null);
            abortControllerRef.current = null;
          }
        },
        abortControllerRef.current.signal
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
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          events: []
        }
      ]);
    }
  };

  // Handle stop/cancel request
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
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
            : `**Command failed:**\n\`\`\`\n${result.output || 'No output'}\n\`\`\`\n`,
          events: []
        }
      ]);
    } catch (error) {
      console.error('Failed to execute command:', error);

      // Add error message
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error executing command: ${error instanceof Error ? error.message : String(error)}`,
          events: []
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
              className="fixed inset-0 bg-black/20 z-40"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={backdropVariants}
              onClick={handleClose}
            />

            {/* Drawer with smooth animation */}
            <motion.div
              className="fixed top-0 right-0 h-full w-1/2 bg-drawer/60 backdrop-blur-lg shadow-lg z-40"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={drawerVariants}
            >
              <div className="flex flex-col h-full">
                <div className="px-2 py-2 bg-muted/20 flex items-center justify-between">
                  <div className='flex items-center space-x-2'>
                    {showChatSettings && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowChatSettings(false)}
                        className="p-1 text-foreground"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Back to Chat
                      </Button>
                    )}
                    {!showChatSettings && (
                      <>
                        <div>
                          <div className='bg-muted/20 p-1 rounded-md'>
                            <AgentkubeBot className='text-green-400 h-5 w-5' />
                          </div>
                        </div>
                        <h3 className="font-medium text-sm text-foreground"><span className='text-muted-foreground'>Assistant</span> Talk to Cluster</h3>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
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
    [&::-webkit-scrollbar-thumb]:bg-border
    [&::-webkit-scrollbar-thumb]:rounded-full
    [&::-webkit-scrollbar-thumb:hover]:bg-border/70
    overflow-auto transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-full'}`}
                >
                  {!showChatSettings ? (
                    <Messages
                      messages={messages}
                      currentText={currentText}
                      currentEvents={currentEvents}
                      isLoading={isLoading}
                      onQuestionClick={handleQuestionClick}
                      suggestedQuestions={suggestedQuestions}
                      elapsedTime={elapsedTime}
                      onRetry={handleRetry}
                      currentTodos={persistedTodos}
                    />
                  ) : (
                    <ChatSetting />
                  )}
                </div>


                {!showChatSettings && <SignInContainer />}
                {!showChatSettings && <UpgradeToProContainer />}

                {!showChatSettings && (
                  <div className="border-t border-border px-3 py-4 mt-auto relative">
                    {/* Stack container for prompts - grows upward from bottom */}
                    {(showTodoProgress && persistedTodos.length > 0 || pendingToolApproval && currentTraceId) && (
                      <div className="absolute bottom-full left-0 right-0 mb-2 px-3 z-50 flex flex-col-reverse gap-2">
                        {/* Tool Permission Prompt - appears above textarea */}
                        {pendingToolApproval && currentTraceId && (
                          <ToolPermissionPrompt
                            traceId={currentTraceId}
                            tool={pendingToolApproval.tool}
                            args={pendingToolApproval.args}
                            callId={pendingToolApproval.callId}
                            message={pendingToolApproval.message}
                            onClose={() => setPendingToolApproval(null)}
                          />
                        )}

                        {/* Todo Progress Indicator - stacks above Tool Permission Prompt */}
                        {showTodoProgress && persistedTodos.length > 0 && (
                          <TodoProgressIndicator
                            todos={persistedTodos}
                            onClose={() => setShowTodoProgress(false)}
                          />
                        )}
                      </div>
                    )}

                    {structuredContent.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {structuredContent.map((item, index) => (
                          <div
                            key={index}
                            className="flex items-center max-w-52 text-xs text-foreground bg-secondary border border-border rounded px-1 py-2"
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
                      <div className="flex items-center gap-1">
                        <ResourceContext onResourceSelect={handleAddContext} />
                        <ResourceContextSuggestion onResourceSelect={handleAddContext} />
                      </div>
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div
                                // size="sm"
                                onClick={() => setAutoApprove(!autoApprove)}
                                className={`px-2 cursor-pointer flex items-center gap-1.5 mt-1 ${autoApprove
                                  ? 'text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/20'
                                  : 'text-green-600 dark:text-green-500 hover:bg-emerald-100 dark:hover:bg-emerald-900/20'
                                  }`}
                              >
                                {/* {autoApprove ? (
                                  <ShieldCheck className="h-4 w-4" />
                                ) : (
                                  <ShieldAlert className="h-4 w-4" />
                                )} */}
                                <span className="text-xs font-medium">
                                  {autoApprove ? 'Auto approve' : 'Ask before edit'}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className='p-1'>
                              <p className="text-xs">
                                {autoApprove
                                  ? 'Tools will execute automatically without asking for approval'
                                  : 'You will be asked before each tool execution'}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Press <kbd className="px-1 py-0.5 text-xs font-semibold text-gray-800 bg-gray-400/20 rounded">Ctrl</kbd> + <kbd className="px-1 py-0.5 text-xs font-semibold text-gray-800 bg-gray-400/20 rounded">Tab</kbd> to toggle
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
                      </div>
                    </div>

                    {contextFiles.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1 relative">
                        {contextFiles.map(file => (
                          <div
                            key={file.resourceName}
                            className="flex items-center text-xs bg-secondary border border-border rounded px-2 py-0.5"
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

                    <form onSubmit={handleSubmit}>
                      <AutoResizeTextarea
                        value={inputValue}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
                        onFocus={handleInputFocus}
                        onBlur={handleInputBlur}
                        onSubmit={isLoading ? undefined : handleSubmit}
                        placeholder={isLoading ? "Waiting for response..." : "Ask anything (⌘L)"}
                        disabled={false}
                        className="border-transparent"
                        autoFocus={true}
                        mentionItems={mentionData}
                        onMentionSelect={handleMentionSelect}
                      />
                    </form>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  toast({
                                    title: "Coming Soon",
                                    description: "Add Image feature is yet to be implemented",
                                  });
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 h-auto text-xs text-muted-foreground hover:text-foreground hover:bg-accent-hover rounded-md"
                              >
                                <Image className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="p-1">
                              <p>Add image</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => {
                                  toast({
                                    title: "Coming Soon",
                                    description: "Browser feature is yet to be implemented",
                                  });
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 h-auto text-xs text-muted-foreground hover:text-foreground hover:bg-accent-hover rounded-md"
                              >
                                <AppWindow className="h-4 w-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="p-1">
                              <p>Browser</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <ReasoningEffort
                          value={reasoningEffort}
                          onChange={setReasoningEffort}
                        />
                      </div>

                      <div className="flex items-center">
                        {isLoading ? (
                          <Button
                            variant="outline"
                            onClick={handleStop}
                            className="rounded-md text-primary-foreground bg-primary hover:bg-primary/90"
                          >
                            <Pause className='h-1 w-1 rounded-md' />
                          </Button>
                        ) : (
                          <Button
                            onClick={handleSubmit}
                            disabled={!inputValue.trim()}
                            className="p-3 h-2 w-2 rounded-full text-primary-foreground bg-primary hover:bg-primary/90"
                          >
                            <ArrowUp className='h-2 w-2' />
                          </Button>
                        )}
                      </div>
                    </div>
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
