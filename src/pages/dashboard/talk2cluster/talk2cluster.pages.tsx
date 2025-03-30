import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCluster } from '@/contexts/clusterContext';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, MessageSquare, Send, RotateCw, Search, Calendar, Clock, Trash, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AutoResizeTextarea, ModelSelector, ResourceContext } from '@/components/custom';
import { ChatMessage } from '@/types/chat';
import UserMessage from './components/user.t2c';
import AssistantMessage from './components/assistant.t2c';
import {
  completionStream,
  listConversations,
  getConversation,
  createConversation,
  deleteConversation,
  ToolCall,
  Conversation
} from '@/api/orchestrator.chat';

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
  const [initialLoading, setInitialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [expandedTools, setExpandedTools] = useState<{ [key: number]: boolean }>({});

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

  // Scroll to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

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

  // Clear chat history
  const clearHistory = () => {
    if (conversationId) {
      deleteConversation(conversationId)
        .then(() => {
          navigate('/dashboard/talk2cluster');
          setHistory([]);
          setMessage('');
          setToolCalls([]);
          loadConversations(); // Refresh the conversation list
        })
        .catch(err => {
          console.error('Error deleting conversation:', err);
        });
    } else {
      setHistory([]);
      setMessage('');
      setToolCalls([]);
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

    completionStream(
      {
        message: userMessage,
        conversation_id: convId,
        model: selectedModel,
        kubecontext: currentContext?.name
      },
      {
        onStart: (messageId, messageUuid) => {
          console.log(`Started streaming: ${messageId}`);
        },
        onContent: (index, text) => {
          assistantResponse += text;
        },
        onToolCall: (toolCall) => {
          toolCallsList.push(toolCall);
          setToolCalls(prev => [...prev, toolCall]);
        },
        onComplete: (reason) => {
          if (assistantResponse.trim()) {
            setHistory(prev => [
              ...prev,
              {
                role: 'assistant',
                content: assistantResponse,
                name: 'supervisor'
              }
            ]);
          }
          setIsChatLoading(false);
          console.log(`Completed streaming: ${reason}`);

          // Refresh conversations after completion
          loadConversations();
        },
        onError: (error) => {
          console.error('Streaming error:', error);
          setError(error.message);
          setIsChatLoading(false);
        }
      }
    );
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
  };

  // Filter history based on search query
  const filteredHistory = searchQuery.trim()
    ? history.filter(msg =>
      msg.content.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : history;

  // Filter conversations based on search query
  const filteredConversations = searchQuery.trim()
    ? allConversations.filter(conv =>
      conv.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : allConversations;

  // Suggested questions for empty state
  const suggestedQuestions = [
    "What are the resource usage patterns in my cluster?",
    "Are there any security vulnerabilities in my deployments?",
    "How can I optimize my Vertical Pod Autoscalers?",
    "Show me best practices for namespace organization",
    "What's the current status of my pods in the default namespace?"
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
        <div className="w-[68%] flex flex-col">
          <Card className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900/20 border-gray-200 dark:border-gray-800/40">

            {/* Chat content area */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-auto pt-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
                [&::-webkit-scrollbar]:w-1.5 
                [&::-webkit-scrollbar-track]:bg-transparent 
                [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50"
            >
              {history.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center">
                  <Sparkles className="h-16 w-16 text-gray-300 dark:text-gray-700 mb-4" />
                  <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Talk to your Kubernetes Cluster
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-center mb-8 max-w-md">
                    Ask questions about your cluster configuration, get recommendations, or troubleshoot issues.
                  </p>

                  <div className="grid grid-cols-1 gap-3 w-full max-w-lg">
                    {suggestedQuestions.map((question, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        className="justify-start text-left h-auto py-3 px-4"
                        onClick={() => handleQuestionClick(question)}
                      >
                        <Sparkles className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="truncate">{question}</span>
                      </Button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredHistory.map((message, index) => (
                    <div key={index}>
                      {message.role === 'user' && (
                        <UserMessage content={message.content} />
                      )}

                      {message.role === 'assistant' && (
                        <AssistantMessage content={message.content} />
                      )}
                    </div>
                  ))}

                  {/* Streaming Animation */}
                  {isChatLoading && (
                    <div className="flex justify-center py-4">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="animate-spin h-5 w-5 text-gray-500" />
                        <span className="text-sm text-gray-500">Thinking...</span>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Input area */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800/80">
              <div className="flex justify-between items-center mb-2">
                {/* Tool Calls display */}
                {/* <ResourceContext onResourceSelect={handleAddContext} /> */}
                <div>
                  {toolCalls.length > 0 && (
                    <div className="text-xs text-gray-500">
                      {toolCalls.length} tool {toolCalls.length === 1 ? 'call' : 'calls'} executed
                    </div>
                  )}
                </div>

                <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
              </div>

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

        {/* Right side - History and Tool Calls */}
        <div className="w-[30%] flex flex-col gap-4">
          {/* Conversation History */}
          <Card className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900/20 border-gray-200 dark:border-gray-800/40">
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800/80">
              <h2 className="font-semibold">Conversations</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={startNewConversation}
                className="text-xs"
              >
                New Chat
              </Button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-800/80">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
              [&::-webkit-scrollbar]:w-1.5 
              [&::-webkit-scrollbar-track]:bg-transparent 
              [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

              {isLoadingConversations ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : allConversations.length === 0 ? (
                <div className="h-full flex flex-col justify-center items-center text-gray-500 dark:text-gray-400">
                  <p className="text-center">Your conversations will appear here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredConversations.map((conversation) => (
                    <div
                      key={conversation.id}
                      className={`p-3 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 cursor-pointer ${conversationId === conversation.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-800'
                        }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h3
                          className="font-medium text-sm truncate pr-2 flex-1"
                          onClick={() => navigateToConversation(conversation.id)}
                        >
                          {conversation.title}
                        </h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 ml-1 text-gray-500 hover:text-red-500"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteConversation(conversation.id)
                              .then(() => {
                                if (conversationId === conversation.id) {
                                  navigate('/dashboard/talk2cluster');
                                }
                                loadConversations();
                              })
                              .catch(err => {
                                console.error('Error deleting conversation:', err);
                              });
                          }}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                      <div
                        className="flex items-center text-xs text-gray-500"
                        onClick={() => navigateToConversation(conversation.id)}
                      >
                        <Calendar className="h-3 w-3 mr-1" />
                        <span>{formatDate(conversation.updated_at)}</span>
                        <span className="mx-2">•</span>
                        <MessageSquare className="h-3 w-3 mr-1" />
                        <span>{conversation.message_count} messages</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-200 dark:border-gray-800/50 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={clearHistory}
                disabled={!conversationId || history.length === 0}
              >
                {conversationId ? "Delete conversation" : "Clear history"}
              </Button>
            </div>
          </Card>

          {/* Tool Calls History */}
          {toolCalls.length > 0 && (
            <Card className="h-1/2 flex flex-col overflow-hidden bg-white dark:bg-gray-900/20 border-gray-200 dark:border-gray-800/40">
              <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800/80">
                <h2 className="font-semibold">Tool Calls</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setToolCalls([])}
                >
                  Clear
                </Button>
              </div>

              <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
                [&::-webkit-scrollbar]:w-1.5 
                [&::-webkit-scrollbar-track]:bg-transparent 
                [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                [&::-webkit-scrollbar-thumb]:rounded-full
                [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

                <div className="space-y-4">
                  {toolCalls.map((tool, idx) => (
                    <div key={idx} className="p-3 border border-gray-200 dark:border-gray-800 rounded-lg text-sm">
                      <div
                        className="font-medium text-blue-600 dark:text-blue-400 flex justify-between items-center cursor-pointer"
                        onClick={() => {
                          setExpandedTools(prev => ({
                            ...prev,
                            [idx]: !prev[idx]
                          }));
                        }}
                      >
                        <span>{tool.tool}</span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${expandedTools[idx] ? 'rotate-180' : ''}`} />
                      </div>

                      {expandedTools[idx] && (
                        <>
                          <div className="mt-2 mb-2 text-gray-700 dark:text-gray-300 font-mono text-xs overflow-x-auto whitespace-pre-wrap">
                            {JSON.stringify(tool.command, null, 2)}
                          </div>
                          <div className="text-gray-600 dark:text-gray-400 font-mono text-xs overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {tool.output}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Talk2Cluster;