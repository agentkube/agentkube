import React, { useState, useEffect } from 'react';
import { History, Trash2, MessageSquare, Loader2, ChevronDown, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { listSessions, deleteSession, SessionInfo, formatSessionTime } from '@/api/session';

interface ChatHistoryDropdownProps {
  currentSessionId?: string;
  onSessionSelect: (sessionId: string | null, messages?: any[]) => void;
  onNewChat: () => void;
}

export const ChatHistoryDropdown: React.FC<ChatHistoryDropdownProps> = ({
  currentSessionId,
  onSessionSelect,
  onNewChat,
}) => {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy id:', err);
    }
  };

  // Fetch sessions when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const response = await listSessions(20);
      setSessions(response.sessions);
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    setDeletingId(sessionId);
    try {
      await deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));

      // If deleting current session, clear the chat
      if (sessionId === currentSessionId) {
        onNewChat();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSessionClick = (session: SessionInfo) => {
    if (session.id === currentSessionId) return;
    onSessionSelect(session.id);
    setIsOpen(false);
  };

  const handleNewChat = () => {
    onNewChat();
    setIsOpen(false);
  };

  // Truncate title if too long
  const truncateTitle = (title: string, maxLength: number = 30) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="p-1 gap-1"
            >
              <History className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent className="p-1">
          <p>Chat history</p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align="end"
        className="w-96 max-h-96 overflow-hidden bg-popover/95 backdrop-blur-xl border-border"
      >
        <DropdownMenuLabel className="py-2">
          <span className="text-sm font-medium">Chat History</span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <div className="max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No chat history</p>
              <p className="text-xs">Start a conversation to see it here</p>
            </div>
          ) : (
            sessions.map((session, index) => {
              // Determine the date category for this session
              const sessionDate = new Date(session.time.updated * 1000);
              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
              const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
              const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

              let category: string;
              if (sessionDate >= today) {
                category = 'Today';
              } else if (sessionDate >= yesterday) {
                category = 'Yesterday';
              } else if (sessionDate >= weekAgo) {
                category = 'Past week';
              } else if (sessionDate >= monthAgo) {
                category = 'Past month';
              } else {
                category = 'Older';
              }

              // Check if we need to show a separator (first item or different category from previous)
              let showSeparator = false;
              if (index === 0) {
                showSeparator = true;
              } else {
                const prevSession = sessions[index - 1];
                const prevDate = new Date(prevSession.time.updated * 1000);
                let prevCategory: string;
                if (prevDate >= today) {
                  prevCategory = 'Today';
                } else if (prevDate >= yesterday) {
                  prevCategory = 'Yesterday';
                } else if (prevDate >= weekAgo) {
                  prevCategory = 'Past week';
                } else if (prevDate >= monthAgo) {
                  prevCategory = 'Past month';
                } else {
                  prevCategory = 'Older';
                }
                showSeparator = category !== prevCategory;
              }

              return (
                <React.Fragment key={session.id}>
                  {showSeparator && (
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-secondary/30">
                      {category}
                    </div>
                  )}
                  <DropdownMenuItem
                    onClick={() => handleSessionClick(session)}
                    className={`flex items-center gap-2 px-3 py-1 cursor-pointer group ${session.id === currentSessionId
                      ? 'bg-secondary/50'
                      : 'hover:bg-secondary/30'
                      }`}
                  >
                    <div
                      onClick={(e) => handleCopyId(e, session.id)}
                      className="h-4 w-4 flex-shrink-0 flex items-center justify-center rounded cursor-pointer hover:bg-muted group/icon transition-colors"
                      title="Copy Session ID"
                    >
                      {copiedId === session.id ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <>
                          <MessageSquare className="h-4 w-4 text-muted-foreground group-hover/icon:hidden" />
                          <Copy className="h-3.5 w-3.5 text-muted-foreground hidden group-hover/icon:block" />
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-xs font-medium truncate ${session.id === currentSessionId ? 'text-primary' : 'text-foreground'
                          }`}>
                          {truncateTitle(session.title)}
                        </span>
                        {session.status === 'busy' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
                            active
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          {formatSessionTime(session.time.updated)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">

                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteSession(e, session.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-opacity"
                      disabled={deletingId === session.id}
                    >
                      {deletingId === session.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-accent-foreground" />
                      )}
                    </button>
                  </DropdownMenuItem>
                </React.Fragment>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
