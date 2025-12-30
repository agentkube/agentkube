import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Terminal, Plus, X, ChevronDown, ExternalLink, MoreHorizontal, Edit2, Check, Globe, AtSign, FileText } from 'lucide-react';
import { toast as sooner } from "sonner";
import { invoke } from '@tauri-apps/api/core';
import { SiClaude } from '@icons-pack/react-simple-icons';
import TerminalTab from './terminaltab.component';
import BrowserTab from '../browser/browser.component';
import EditorTab from '@/components/editortab/editortab.component';
import DefaultProfileDialog from './default-profile-dialog.component';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { useTerminal, TerminalSession, BrowserSession, EditorSession, Session } from '@/contexts/useTerminal';
import { useDrawer } from '@/contexts/useDrawer';
import { useCluster } from '@/contexts/clusterContext';

interface PendingRequest {
  command?: string;
  name?: string;
}

interface PendingBrowserRequest {
  url: string;
  name?: string;
}

interface PendingEditorRequest {
  filePath: string;
  name?: string;
  content?: string;
}

interface TerminalProfile {
  id: string;
  name: string;
  shell_path: string;
  icon: string | null;
  is_default: boolean;
}

interface TerminalManagerProps {
  isOpen: boolean;
  onClose: () => void;
  pendingRequest?: PendingRequest | null;
  onPendingRequestHandled?: () => void;
  pendingBrowserRequest?: PendingBrowserRequest | null;
  onPendingBrowserRequestHandled?: () => void;
  pendingEditorRequest?: PendingEditorRequest | null;
  onPendingEditorRequestHandled?: () => void;
}

const TerminalManager: React.FC<TerminalManagerProps> = ({
  isOpen,
  onClose,
  pendingRequest,
  onPendingRequestHandled,
  pendingBrowserRequest,
  onPendingBrowserRequestHandled,
  pendingEditorRequest,
  onPendingEditorRequestHandled
}) => {
  const {
    sessions,
    setSessions,
    activeSessionId,
    setActiveSessionId,
    getTerminalContent
  } = useTerminal();
  const { currentContext } = useCluster();
  const { addResourceContext } = useDrawer();
  const [terminalHeight, setTerminalHeight] = useState('40vh');
  const [isDragging, setIsDragging] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [terminalProfiles, setTerminalProfiles] = useState<TerminalProfile[]>([]);
  const terminalHeaderRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const [isDefaultDialogOpen, setIsDefaultDialogOpen] = useState(false);
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(() => {
    return localStorage.getItem('default_terminal_profile');
  });

  // Fetch available terminal profiles on mount
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const profiles = await invoke<TerminalProfile[]>('get_available_profiles');

        // Sort so the selected default profile is first
        const sortedProfiles = [...profiles].sort((a, b) => {
          const aIsDefault = defaultProfileId ? a.id === defaultProfileId : a.is_default;
          const bIsDefault = defaultProfileId ? b.id === defaultProfileId : b.is_default;
          if (aIsDefault && !bIsDefault) return -1;
          if (!aIsDefault && bIsDefault) return 1;
          return 0;
        });

        setTerminalProfiles(sortedProfiles);
      } catch (err) {
        console.error('Failed to fetch terminal profiles:', err);
      }
    };
    fetchProfiles();
  }, [defaultProfileId]);

  // Create a new local terminal session
  const createNewSession = useCallback(async (name?: string, initialCommand?: string, shellPath?: string) => {
    try {
      // Use provided shellPath, or cached default, or let backend decide
      let finalShellPath = shellPath;
      if (!finalShellPath && defaultProfileId) {
        const profile = terminalProfiles.find(p => p.id === defaultProfileId);
        if (profile) {
          finalShellPath = profile.shell_path;
        }
      }

      // Automatically set current context if available
      let finalCommand = initialCommand;
      if (currentContext) {
        const kubeconfig = currentContext.meta_data?.origin?.kubeconfig;
        const originalName = currentContext.meta_data?.originalName || currentContext.name;

        if (kubeconfig && originalName) {
          const isPowerShell = finalShellPath?.toLowerCase().includes('powershell') || finalShellPath?.toLowerCase().includes('pwsh');
          const isCmd = finalShellPath?.toLowerCase().includes('cmd.exe');

          let contextCmd = '';
          if (isPowerShell) {
            contextCmd = `$env:KUBECONFIG="${kubeconfig}"; kubectl config use-context "${originalName}"; clear`;
          } else if (isCmd) {
            contextCmd = `set KUBECONFIG=${kubeconfig} && kubectl config use-context ${originalName} && cls`;
          } else {
            // Default to Unix-style (Zsh/Bash)
            contextCmd = `export KUBECONFIG="${kubeconfig}" && kubectl config use-context "${originalName}" && clear`;
          }

          finalCommand = initialCommand ? `${contextCmd} && ${initialCommand}` : contextCmd;
        }
      }

      const session = await invoke<TerminalSession>('create_local_shell', {
        name: name || undefined,
        cols: 80,
        rows: 24,
        initialCommand: finalCommand || undefined,
        shellPath: finalShellPath || undefined,
      });

      setSessions((prev) => [...prev, { type: 'terminal', data: session }]);
      setActiveSessionId(session.id);

      return session;
    } catch (err) {
      console.error('Failed to create terminal session:', err);
      throw err;
    }
  }, [defaultProfileId, terminalProfiles, currentContext, setSessions, setActiveSessionId]);

  // Create a new browser session
  const createBrowserSession = useCallback((url?: string, name?: string) => {
    const id = `browser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const browserSession: BrowserSession = {
      id,
      name: name || 'Browser',
      url: url || '',
      created_at: Date.now(),
    };

    setSessions((prev) => [...prev, { type: 'browser', data: browserSession }]);
    setActiveSessionId(id);

    return browserSession;
  }, []);

  // Create a new editor session
  const createEditorSession = useCallback((filePath: string, name?: string, content?: string) => {
    const id = `editor-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const editorSession: EditorSession = {
      id,
      name: name || filePath.split('/').pop() || 'Untitled',
      filePath,
      content,
      created_at: Date.now(),
    };

    setSessions((prev) => [...prev, { type: 'editor', data: editorSession }]);
    setActiveSessionId(id);

    return editorSession;
  }, []);

  // Close a session (terminal or browser)
  const closeSession = useCallback(async (sessionId: string) => {
    // Find if this is a terminal session
    const session = sessions.find((s) => s.data.id === sessionId);

    // Only call backend close for terminal sessions
    if (session?.type === 'terminal') {
      try {
        await invoke('close_session', { sessionId });
      } catch (err) {
        console.error('Failed to close terminal session:', err);
      }
    }

    setSessions((prev) => {
      const newSessions = prev.filter((s) => s.data.id !== sessionId);

      // If closing the active session, switch to another one
      if (activeSessionId === sessionId && newSessions.length > 0) {
        setActiveSessionId(newSessions[newSessions.length - 1].data.id);
      } else if (newSessions.length === 0) {
        setActiveSessionId(null);
      }

      return newSessions;
    });
  }, [activeSessionId, sessions]);

  // Close all sessions except the specified one
  const closeOtherSessions = useCallback(async (keepSessionId: string) => {
    const sessionsToClose = sessions.filter((s) => s.data.id !== keepSessionId);

    for (const session of sessionsToClose) {
      if (session.type === 'terminal') {
        try {
          await invoke('close_session', { sessionId: session.data.id });
        } catch (err) {
          console.error('Failed to close session:', session.data.id, err);
        }
      }
    }

    setSessions((prev) => prev.filter((s) => s.data.id === keepSessionId));
    setActiveSessionId(keepSessionId);
  }, [sessions]);

  // Close all sessions
  const closeAllSessions = useCallback(async () => {
    try {
      await invoke('close_all_sessions');
      setSessions([]);
      setActiveSessionId(null);
    } catch (err) {
      console.error('Failed to close all sessions:', err);
    }
  }, []);

  // Rename a session
  const renameSession = useCallback(async (sessionId: string, newName: string) => {
    const session = sessions.find((s) => s.data.id === sessionId);

    // Only call backend rename for terminal sessions
    if (session?.type === 'terminal') {
      try {
        await invoke('rename_session', { sessionId, newName });
      } catch (err) {
        console.error('Failed to rename session:', err);
      }
    }

    setSessions((prev) =>
      prev.map((s): Session => {
        if (s.data.id === sessionId) {
          return { ...s, data: { ...s.data, name: newName } } as Session;
        }
        return s;
      })
    );
  }, [sessions]);

  // Add session context to chat
  const handleAddToChat = useCallback((session: Session) => {
    if (session.type === 'terminal') {
      const content = getTerminalContent(session.data.id);
      addResourceContext({
        resourceType: 'terminal',
        resourceName: session.data.name,
        namespace: '',
        namespaced: false,
        group: 'terminal',
        version: 'v1',
        resourceContent: content
      });

      sooner("Added to Chat", {
        description: `Terminal session "${session.data.name}" added to context.`,
      });
    }
  }, [addResourceContext, getTerminalContent]);

  // Start editing a session name
  const startEditing = useCallback((session: Session) => {
    setEditingSessionId(session.data.id);
    setEditingName(session.data.name);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 50);
  }, []);

  // Commit the name edit
  const commitEdit = useCallback(() => {
    if (editingSessionId && editingName.trim()) {
      renameSession(editingSessionId, editingName.trim());
    }
    setEditingSessionId(null);
    setEditingName('');
  }, [editingSessionId, editingName, renameSession]);

  // Cancel the name edit
  const cancelEdit = useCallback(() => {
    setEditingSessionId(null);
    setEditingName('');
  }, []);

  const handleSaveDefaultProfile = useCallback((profileId: string) => {
    setDefaultProfileId(profileId);
    localStorage.setItem('default_terminal_profile', profileId);
    sooner("Default profile updated", {
      description: `New default profile set to ${terminalProfiles.find(p => p.id === profileId)?.name}`
    });
  }, [terminalProfiles]);

  // Launch external terminal
  const launchExternalTerminal = useCallback(async (terminalType: string) => {
    try {
      await invoke('launch_external_terminal', { terminalType });
    } catch (err) {
      console.error('Failed to launch external terminal:', err);
    }
  }, []);

  // Create initial session when terminal opens and there are no sessions
  useEffect(() => {
    if (isOpen && sessions.length === 0 && !pendingRequest) {
      createNewSession();
    }
  }, [isOpen, sessions.length, createNewSession, pendingRequest]);

  // Handle pending command requests from context
  useEffect(() => {
    if (isOpen && pendingRequest) {
      createNewSession(pendingRequest.name, pendingRequest.command);
      onPendingRequestHandled?.();
    }
  }, [isOpen, pendingRequest, createNewSession, onPendingRequestHandled]);

  // Handle pending browser requests from context
  useEffect(() => {
    if (isOpen && pendingBrowserRequest) {
      createBrowserSession(pendingBrowserRequest.url, pendingBrowserRequest.name);
      onPendingBrowserRequestHandled?.();
    }
  }, [isOpen, pendingBrowserRequest, createBrowserSession, onPendingBrowserRequestHandled]);

  // Handle pending editor requests from context
  useEffect(() => {
    if (isOpen && pendingEditorRequest) {
      createEditorSession(pendingEditorRequest.filePath, pendingEditorRequest.name, pendingEditorRequest.content);
      onPendingEditorRequestHandled?.();
    }
  }, [isOpen, pendingEditorRequest, createEditorSession, onPendingEditorRequestHandled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      // Cmd/Ctrl + T: New tab
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault();
        createNewSession();
      }

      // Cmd/Ctrl + W: Close current tab
      if ((e.metaKey || e.ctrlKey) && e.key === 'w' && activeSessionId) {
        e.preventDefault();
        closeSession(activeSessionId);
      }

      // Cmd/Ctrl + 1-9: Switch to tab
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        if (sessions[index]) {
          setActiveSessionId(sessions[index].data.id);
        }
      }

      // Cmd/Ctrl + Shift + [ or ]: Previous/Next tab
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        const currentIndex = sessions.findIndex((s) => s.data.id === activeSessionId);
        if (e.key === '[' && currentIndex > 0) {
          e.preventDefault();
          setActiveSessionId(sessions[currentIndex - 1].data.id);
        } else if (e.key === ']' && currentIndex < sessions.length - 1) {
          e.preventDefault();
          setActiveSessionId(sessions[currentIndex + 1].data.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeSessionId, sessions, createNewSession, closeSession]);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    const handleResize = (e: MouseEvent) => {
      if (isDragging) {
        const viewportHeight = window.innerHeight;
        const mouseY = e.clientY;
        const heightFromBottom = viewportHeight - mouseY;
        const heightPercentage = Math.min(Math.max((heightFromBottom / viewportHeight) * 100, 20), 90);
        setTerminalHeight(`${heightPercentage}vh`);
      }
    };

    const handleResizeEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = '';
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isDragging]);

  // Handle close - close all sessions when terminal panel is closed
  const handleClose = useCallback(() => {
    // closeAllSessions();
    onClose();
  }, [
    // closeAllSessions, 
    onClose]);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 backdrop-blur-xl z-50 border-t border-border"
      style={{
        height: terminalHeight,
        display: isOpen ? 'block' : 'none',
      }}
    >
      {/* Resize handle */}
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-transparent cursor-ns-resize z-10 hover:bg-blue-500/30 transition-colors"
        onMouseDown={handleResizeStart}
      />

      {/* Header with tabs */}
      <div
        ref={terminalHeaderRef}
        className="flex items-center justify-between bg-card/20 border-b border-border"
      >
        {/* Left side: Tabs */}
        <div className="flex items-center flex-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-700">
          <div className="flex items-center px-2 py-1 border-r border-border gap-1">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Terminal</span>
          </div>

          <div className="flex items-center">
            {sessions.map((session, index) => (
              <ContextMenu key={session.data.id}>
                <ContextMenuTrigger>
                  <div
                    className={`group flex items-center gap-1 px-3 py-1.5 border-r border-border cursor-pointer transition-colors ${activeSessionId === session.data.id
                      ? 'bg-accent/50 text-foreground'
                      : 'text-muted-foreground hover:bg-background/50 hover:text-foreground'
                      } ${session.type === 'editor' && (session.data as EditorSession).hasUnsavedChanges
                        ? 'border-b border-b-foreground/50'
                        : ''
                      }`}
                    onClick={() => setActiveSessionId(session.data.id)}
                  >
                    {editingSessionId === session.data.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit();
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="bg-transparent border border-border rounded px-1 text-xs w-20 outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            commitEdit();
                          }}
                          className="p-0.5 hover:bg-accent rounded"
                        >
                          <Check className="h-3 w-3 text-green-500" />
                        </button>
                      </div>
                    ) : (
                      <>
                        {session.type === 'browser' ? (
                          <>
                            <Globe className="h-3 w-3 text-blue-400" />
                            <span className="text-xs whitespace-nowrap">
                              {session.data.name}
                            </span>
                          </>
                        ) : session.type === 'editor' ? (
                          <>
                            <FileText className="h-3 w-3 text-yellow-400" />
                            <span className="text-xs whitespace-nowrap">
                              {session.data.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-xs whitespace-nowrap">
                              Terminal{' '}
                              <span className="text-muted-foreground/50">
                                {session.data.name.replace('Terminal ', '')}
                              </span>
                            </span>
                          </>
                        )}
                        <span className="text-[10px] text-muted-foreground/60">
                          {index + 1}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToChat(session);
                          }}
                          className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity text-muted-foreground hover:text-foreground"
                          title="Add to Chat"
                        >
                          <AtSign className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            closeSession(session.data.id);
                          }}
                          className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="bg-card border-border">
                  <ContextMenuItem
                    onClick={() => startEditing(session)}
                    className="text-xs"
                  >
                    <Edit2 className="h-3 w-3 mr-2" />
                    Rename
                  </ContextMenuItem>
                  {session.type === 'terminal' && (
                    <ContextMenuItem
                      onClick={() => handleAddToChat(session)}
                      className="text-xs"
                    >
                      <AtSign className="h-3 w-3 mr-2" />
                      Add to Chat
                    </ContextMenuItem>
                  )}
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onClick={() => closeSession(session.data.id)}
                    className="text-xs"
                  >
                    <X className="h-3 w-3 mr-2" />
                    Close
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => closeOtherSessions(session.data.id)}
                    className="text-xs"
                    disabled={sessions.length === 1}
                  >
                    Close Others
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={closeAllSessions}
                    className="text-xs text-red-400"
                  >
                    Close All
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>

          {/* New tab dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="New Tab (⌘T)"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="bg-card border-border min-w-[180px]">
              <DropdownMenuItem
                onClick={() => createNewSession()}
                className="text-xs"
              >
                <Terminal className="h-3.5 w-3.5 mr-2" />
                New Terminal
              </DropdownMenuItem>

              {/* Terminal Profiles */}
              {terminalProfiles.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {terminalProfiles.map((profile) => (
                    <DropdownMenuItem
                      key={profile.id}
                      onClick={() => createNewSession(profile.name, undefined, profile.shell_path)}
                      className="text-xs"
                    >
                      <Terminal className="h-3.5 w-3.5 mr-2" />
                      {profile.name}
                      {(defaultProfileId ? profile.id === defaultProfileId : profile.is_default) && (
                        <span className="ml-auto text-[10px] text-muted-foreground">(default)</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => createBrowserSession()}
                className="text-xs"
              >
                <Globe className="h-3.5 w-3.5 mr-2" />
                New Browser
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => createEditorSession('Untitled.md', 'Untitled.md')}
                className="text-xs"
              >
                <FileText className="h-3.5 w-3.5 mr-2" />
                New Editor
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Right side: Actions */}
        <div className="flex items-center gap-1 px-2">
          {/* Claude AI button */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => createNewSession('Claude Code', 'claude')}
                  className="p-1.5 text-[#D97757] hover:bg-accent rounded transition-colors"
                >
                  <SiClaude className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-card text-foreground border-border">
                <p>Open Claude Code</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* External terminal dropdown */}
          {/* <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border">
              <DropdownMenuItem
                onClick={() => launchExternalTerminal('iterm')}
                className="text-xs"
              >
                Open in iTerm
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => launchExternalTerminal('alacritty')}
                className="text-xs"
              >
                Open in Alacritty
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => launchExternalTerminal('default')}
                className="text-xs"
              >
                Open in System Terminal
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu> */}

          {/* More options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border min-w-[180px]">
              <DropdownMenuItem
                onClick={() => createNewSession()}
                className="text-xs"
              >
                <Terminal className="h-3 w-3 mr-2" />
                New Terminal
              </DropdownMenuItem>

              {/* Terminal Profiles Submenu */}
              {terminalProfiles.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="text-xs">
                    <ChevronDown className="h-3 w-3 mr-2" />
                    Launch Profile
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-card border-border">
                    {terminalProfiles.map((profile) => (
                      <DropdownMenuItem
                        key={profile.id}
                        onClick={() => createNewSession(profile.name, undefined, profile.shell_path)}
                        className="text-xs"
                      >
                        <Terminal className="h-3 w-3 mr-2" />
                        <span className="flex-1">{profile.name}</span>
                        {(defaultProfileId ? profile.id === defaultProfileId : profile.is_default) && (
                          <span className="ml-2 text-[10px] text-muted-foreground">(default)</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              <DropdownMenuItem
                onClick={() => setIsDefaultDialogOpen(true)}
                className="text-xs"
              >
                <Terminal className="h-3 w-3 mr-2" />
                Select default Profile
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={closeAllSessions}
                className="text-xs text-red-400"
                disabled={sessions.length === 0}
              >
                <X className="h-3 w-3 mr-2" />
                Close All Terminals
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Close panel button */}
          <button
            onClick={handleClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
            title="Close Terminal Panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Terminal content area */}
      <div
        className="w-full overflow-hidden"
        style={{
          height: `calc(${terminalHeight} - ${terminalHeaderRef.current?.offsetHeight || 40}px)`,
        }}
      >
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No terminal sessions</p>
              <button
                onClick={() => createNewSession()}
                className="mt-2 text-xs text-blue-400 hover:text-blue-300"
              >
                Create New Terminal
              </button>
            </div>
          </div>
        ) : (
          sessions.map((session) =>
            session.type === 'browser' ? (
              <BrowserTab
                key={session.data.id}
                sessionId={session.data.id}
                isActive={activeSessionId === session.data.id}
                initialUrl={(session.data as BrowserSession).url}
              />
            ) : session.type === 'editor' ? (
              <EditorTab
                key={session.data.id}
                sessionId={session.data.id}
                isActive={activeSessionId === session.data.id}
                filePath={(session.data as EditorSession).filePath}
                initialContent={(session.data as EditorSession).content}
                onClose={() => closeSession(session.data.id)}
                onUnsavedChange={(hasUnsaved) => {
                  setSessions((prev) =>
                    prev.map((s) =>
                      s.data.id === session.data.id && s.type === 'editor'
                        ? { ...s, data: { ...s.data, hasUnsavedChanges: hasUnsaved } as EditorSession }
                        : s
                    )
                  );
                }}
              />
            ) : (
              <TerminalTab
                key={session.data.id}
                sessionId={session.data.id}
                isActive={activeSessionId === session.data.id}
              />
            )
          )
        )}
      </div>

      <DefaultProfileDialog
        isOpen={isDefaultDialogOpen}
        onClose={() => setIsDefaultDialogOpen(false)}
        profiles={terminalProfiles}
        currentDefaultId={defaultProfileId}
        onSave={handleSaveDefaultProfile}
      />
    </div >
  );
};

export default TerminalManager;