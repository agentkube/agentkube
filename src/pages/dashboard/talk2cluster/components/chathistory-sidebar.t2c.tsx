import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Loader2,
    Search,
    Calendar,
    MessageSquare,
    Trash,
    ChevronLeft,
    ChevronRight,
    PanelLeft
} from "lucide-react";
import { Conversation } from '@/api/orchestrator.chat';

interface ChatHistorySidebarProps {
    allConversations: Conversation[];
    isLoadingConversations: boolean;
    conversationId?: string;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    onStartNewConversation: () => void;
    onNavigateToConversation: (id: string) => void;
    onDeleteConversation: (id: string) => void;
    onClearHistory: () => void;
    formatDate: (dateString: string) => string;
    onCollapseChange?: (collapsed: boolean) => void;
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
    allConversations,
    isLoadingConversations,
    conversationId,
    searchQuery,
    setSearchQuery,
    onStartNewConversation,
    onNavigateToConversation,
    onDeleteConversation,
    onClearHistory,
    formatDate,
    onCollapseChange
}) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Filter conversations based on search query
    const filteredConversations = searchQuery.trim()
        ? allConversations.filter(conv =>
            conv.title.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : allConversations;

    return (
        <Card className={`flex flex-col overflow-hidden bg-white dark:bg-gray-900/20 border-gray-200 dark:border-gray-800/40 transition-all duration-300 ${isCollapsed ? 'w-12' : 'flex-1'
            }`}>
            {/* Header */}
            <div className="flex justify-between items-center">
                {!isCollapsed && (
                    <>
                        <h2 className="font-semibold">Conversations</h2>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onStartNewConversation}
                            className="text-xs"
                        >
                            New Chat
                        </Button>
                    </>
                )}


                <Button
                    size="sm"
                    onClick={() => {
                        const newCollapsed = !isCollapsed;
                        setIsCollapsed(newCollapsed);
                        onCollapseChange?.(newCollapsed);
                    }}
                    className={`${isCollapsed ? 'w-full justify-center' : ''}`}
                    title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {isCollapsed ? (
                        <PanelLeft className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {!isCollapsed && (
                <>
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
                    <div className="flex-1 overflow-auto p-4 
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
                                                onClick={() => onNavigateToConversation(conversation.id)}
                                            >
                                                {conversation.title}
                                            </h3>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-5 w-5 ml-1 text-gray-500 hover:text-red-500"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteConversation(conversation.id);
                                                }}
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <div
                                            className="flex items-center text-xs text-gray-500"
                                            onClick={() => onNavigateToConversation(conversation.id)}
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
                            onClick={onClearHistory}
                            disabled={!conversationId || allConversations.length === 0}
                        >
                            {conversationId ? "Delete conversation" : "Clear history"}
                        </Button>
                    </div>
                </>
            )}
        </Card>
    );
};

export default ChatHistorySidebar;