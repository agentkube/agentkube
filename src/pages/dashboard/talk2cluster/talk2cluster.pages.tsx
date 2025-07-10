import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCluster } from '@/contexts/clusterContext';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, MessageSquare, Send, RotateCw, Search, Calendar, Clock, Trash, ChevronDown, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AutoResizeTextarea, ModelSelector, ResourceContext, ResourcePreview } from '@/components/custom';
import { ChatMessage } from '@/types/chat';
import Messages from './components/message.t2c';
import {
  completionStream,
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  ToolCall,
  Conversation
} from '@/api/orchestrator.chat';
import { EnrichedSearchResult, SearchResult } from '@/types/search';
import ChatHistorySidebar from './components/chathistory-sidebar.t2c';

interface SuggestedQuestion {
  question: string;
  icon: React.ReactNode;
}

const Talk2Cluster = () => {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { currentContext } = useCluster();

  // Chat state
  const [message, setMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedModel, setSelectedModel] = useState('openai/gpt-4o-mini');

  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [expandedTools, setExpandedTools] = useState<{ [key: number]: boolean }>({});
  const [contextFiles, setContextFiles] = useState<EnrichedSearchResult[]>([]);
  const [previewResource, setPreviewResource] = useState<EnrichedSearchResult | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // References
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load all conversations for history sidebar
  const loadConversations = async () => {
    setIsLoadingConversations(true);
    try {
      const result = await listConversations();
      setAllConversations(result.conversations);
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setIsLoadingConversations(false);
    }
  };

  // Load all conversations on initial render
  useEffect(() => {
    loadConversations();
  }, []);

  // Reload conversations when a new one is created or deleted
  useEffect(() => {
    if (conversationId) {
      loadConversations();
    }
  }, [conversationId]);

  // Load conversation history if conversationId is provided
  useEffect(() => {
    if (conversationId) {
      setInitialLoading(true);
      getConversation(conversationId)
        .then(data => {
          // Convert DB messages to ChatMessage format
          const messages = data.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            name: msg.name
          }));
          setHistory(messages as ChatMessage[]);
        })
        .catch(err => {
          console.error('Error loading conversation:', err);
          setError('Failed to load conversation');
        })
        .finally(() => {
          setInitialLoading(false);
        });
    } else {
      // Clear history when no conversationId is present
      setHistory([]);
    }
  }, [conversationId]);

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
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

  const handleResourcePreview = (resource: EnrichedSearchResult) => {
    setPreviewResource(resource);
  };

  // Clear chat history
  const clearHistory = () => {
    if (conversationId) {
      deleteConversation(conversationId)
        .then(() => {
          navigate('/dashboard/talk2cluster');
          setHistory([]);
          setMessage('');
          setToolCalls([]);
          setCurrentResponse('');
          setCurrentToolCalls([]);
          loadConversations(); // Refresh the conversation list
          setContextFiles([]);
          setCurrentResponse('');
          setCurrentToolCalls([]);
        })
        .catch(err => {
          console.error('Error deleting conversation:', err);
        });
    } else {
      setHistory([]);
      setMessage('');
      setToolCalls([]);
      setCurrentResponse('');
      setCurrentToolCalls([]);
      setContextFiles([]);
      setCurrentResponse('');
      setCurrentToolCalls([]);
    }
  };

  // Navigate to a conversation
  const navigateToConversation = (id: string) => {
    navigate(`/dashboard/talk2cluster/${id}`);
  };

  // Create a new streaming response handler
  const streamingResponse = (userMessage: string, convId?: string) => {
    let assistantResponse = '';
    let toolCallsList: ToolCall[] = [];

    setIsChatLoading(true);
    setCurrentResponse('');
    setCurrentToolCalls([]);

    completionStream(
      {
        message: userMessage,
        conversation_id: convId,
        model: selectedModel,
        kubecontext: currentContext?.name,
        files: contextFiles.length > 0 ? contextFiles.map(file => ({
          resource_name: `${file.resourceType}/${file.resourceName}`,
          resource_content: file.resourceContent || ''
        })) : undefined,
      },
      {
        onStart: (messageId, messageUuid) => {
          console.log(`Started streaming: ${messageId}`);
        },
        onContent: (index, text) => {
          assistantResponse += text;
          setCurrentResponse(assistantResponse);
        },
        onToolCall: (toolCall) => {
          toolCallsList.push(toolCall);
          setToolCalls(prev => [...prev, toolCall]);
          setCurrentToolCalls([...toolCallsList]);
        },
        onComplete: (reason) => {
          if (assistantResponse.trim()) {
            setHistory(prev => [
              ...prev,
              {
                role: 'assistant',
                content: assistantResponse,
                name: 'supervisor',
                toolCalls: toolCallsList.length > 0 ? toolCallsList : undefined
              }
            ]);
          }
          setCurrentResponse('');
          setCurrentToolCalls([]);
          setIsChatLoading(false);
          setContextFiles([]);
          console.log(`Completed streaming: ${reason}`);

          // Refresh conversations after completion
          loadConversations();
        },
        onError: (error) => {
          console.error('Streaming error:', error);
          setError(error.message);
          setCurrentResponse('');
          setCurrentToolCalls([]);
          setIsChatLoading(false);
        }
      }
    );
  };

  const handleDeleteConversation = (id: string) => {
    deleteConversation(id)
      .then(() => {
        if (conversationId === id) {
          navigate('/dashboard/talk2cluster');
        }
        loadConversations();
      })
      .catch(err => {
        console.error('Error deleting conversation:', err);
      });
  };

  // Handle chat submission
  const handleSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
    e.preventDefault();

    if (!message.trim() || isChatLoading) return;

    // Add user message to chat history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message
    };

    setHistory(prev => [...prev, userMessage]);

    try {
      // If we don't have a conversation ID, create a new conversation
      if (!conversationId) {
        const newConversation = await createConversation({
          title: message.length > 30 ? `${message.substring(0, 30)}...` : message
        });

        // Navigate to the new conversation URL
        navigate(`/dashboard/talk2cluster/${newConversation.id}`);

        // Start streaming with the new conversation ID
        streamingResponse(message, newConversation.id);
      } else {
        // Use existing conversation ID
        streamingResponse(message, conversationId);
      }

      // Clear the message input
      setMessage('');

    } catch (err) {
      console.error('Error submitting chat:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setIsChatLoading(false);
    }
  };

  // Create a new conversation
  const startNewConversation = () => {
    navigate('/dashboard/talk2cluster');
    setHistory([]);
    setToolCalls([]);
    setMessage('');
    setCurrentResponse('');
    setCurrentToolCalls([]);
    setContextFiles([]);
    setCurrentResponse('');
    setCurrentToolCalls([]);
  };

  // Filter history based on search query
  const filteredHistory = searchQuery.trim()
    ? history.filter(msg =>
      msg.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : history;


  // Suggested questions for empty state
  const suggestedQuestions: SuggestedQuestion[] = [
    {
      question: "What are the resource usage patterns in my cluster?",
      icon: <Search className="w-4 h-4" />
    },
    {
      question: "Are there any security vulnerabilities in my deployments?",
      icon: <Search className="w-4 h-4" />
    },
    {
      question: "How can I optimize my Vertical Pod Autoscalers?",
      icon: <Search className="w-4 h-4" />
    },
    {
      question: "Show me best practices for namespace organization",
      icon: <Search className="w-4 h-4" />
    },
    {
      question: "What's the current status of my pods in the default namespace?",
      icon: <Search className="w-4 h-4" />
    }
  ];

  const handleQuestionClick = (question: string) => {
    setMessage(question);
  };

  if (initialLoading) {
    return (
      <div className="p-6 h-[92vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading conversation...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 h-[92vh] flex items-center justify-center">
        <div className="max-w-md p-4 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md">
          <h3 className="text-lg font-medium text-red-800 dark:text-red-300">Error</h3>
          <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate('/dashboard/talk2cluster')}
          >
            Start New Conversation
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-[92vh] flex flex-col">

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left side - Chat area */}
        <div className={`flex flex-col transition-all duration-300 ${isSidebarCollapsed ? 'w-[calc(100%-4rem)]' : 'w-[68%]'
          }`}>
          <Card className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900/20 border-gray-200 dark:border-gray-800/40">

            {/* Chat content area - REPLACED WITH MESSAGES COMPONENT */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-auto pt-4 
                [&::-webkit-scrollbar]:w-1.5 
                [&::-webkit-scrollbar-track]:bg-transparent 
                [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50"
            >
              <Messages
                messages={filteredHistory}
                currentResponse={currentResponse}
                currentToolCalls={currentToolCalls}
                isLoading={isChatLoading}
                onQuestionClick={handleQuestionClick}
                suggestedQuestions={suggestedQuestions}
              />
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800/80">
              <div className="flex justify-between items-center mb-2">
                {/* Tool Calls display */}
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

              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <div className="flex-1">
                  <AutoResizeTextarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onSubmit={handleSubmit}
                    placeholder={currentContext ? "Ask about your Kubernetes cluster..." : "Select a cluster first..."}
                    disabled={isChatLoading || !currentContext}
                    className="w-full resize-none border border-gray-300 dark:border-gray-700 rounded-md"
                    autoFocus
                  />

                  {!currentContext && (
                    <div className="mt-2 text-sm text-amber-600 dark:text-amber-400">
                      Please select a cluster context to begin
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isChatLoading || !message.trim() || !currentContext}
                  size="icon"
                  className="h-10 w-10 rounded-full flex-shrink-0"
                >
                  {isChatLoading ?
                    <Loader2 className="h-5 w-5 animate-spin" /> :
                    <Send className="h-5 w-5" />
                  }
                </Button>
              </form>
            </div>
          </Card>
        </div>

        {/* Right side - History */}
        <div className={`flex flex-col gap-4 transition-all duration-300 ${isSidebarCollapsed ? 'w-16' : 'w-[30%]'
          }`}>
          <ChatHistorySidebar
            allConversations={allConversations}
            isLoadingConversations={isLoadingConversations}
            conversationId={conversationId}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onStartNewConversation={startNewConversation}
            onNavigateToConversation={navigateToConversation}
            onDeleteConversation={handleDeleteConversation}
            onClearHistory={clearHistory}
            formatDate={formatDate}
            onCollapseChange={setIsSidebarCollapsed}
          />
        </div>
      </div>
    </div>
  );
};

export default Talk2Cluster;