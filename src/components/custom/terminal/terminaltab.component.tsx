import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { invoke } from '@tauri-apps/api/core';
import { useTerminal } from '@/contexts/useTerminal';
import { useDrawer } from '@/contexts/useDrawer';
import { MessageSquare, MoreHorizontal, AtSign } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import '@xterm/xterm/css/xterm.css';

export interface TerminalTabProps {
  sessionId: string;
  isActive: boolean;
  onClose?: () => void;
}

interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

const defaultTheme: TerminalTheme = {
  background: '#1d1a2607',
  foreground: '#e4e4e4',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: '#3a3d4d',
  black: '#1d1f28',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#c0caf5',
  brightBlack: '#545c7e',
  brightRed: '#ff7a93',
  brightGreen: '#b9f27c',
  brightYellow: '#ff9e64',
  brightBlue: '#7da6ff',
  brightMagenta: '#c0a8e0',
  brightCyan: '#0db9d7',
  brightWhite: '#ffffff',
};

const TerminalTab: React.FC<TerminalTabProps> = ({ sessionId, isActive, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const keyDownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const keyUpHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { registerTerminalInstance, unregisterTerminalInstance, updateSessionLastCommand, sessions, openEditorWithFile, openBrowserWithUrl } = useTerminal();
  const { addResourceContext } = useDrawer();
  const currentCommandRef = useRef<string>('');
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionWidget, setSelectionWidget] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const selectionWidgetRef = useRef<HTMLDivElement>(null);


  const currentSession = sessions.find(s => s.data.id === sessionId);
  const sessionName = currentSession?.data.name || 'Terminal';

  // Extract terminal content
  const getTerminalLines = useCallback(() => {
    if (!terminalInstanceRef.current) return '';
    const buffer = terminalInstanceRef.current.buffer.active;
    const lines: string[] = [];

    // Get last 2000 lines or all if less
    const maxLines = 2000;
    const startRow = Math.max(0, buffer.baseY + buffer.viewportY + terminalInstanceRef.current.rows - maxLines);
    const endRow = buffer.baseY + buffer.viewportY + terminalInstanceRef.current.rows;

    for (let i = startRow; i < endRow; i++) {
      const line = buffer.getLine(i);
      if (line) {
        const lineContent = line.translateToString(true);
        if (line.isWrapped && lines.length > 0) {
          lines[lines.length - 1] += lineContent;
        } else {
          lines.push(lineContent);
        }
      }
    }

    return lines.join('\n');
  }, []);

  // Initialize the terminal instance
  const initTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstanceRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      theme: defaultTheme,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.2,
      scrollback: 5000,
      convertEol: true,
      allowTransparency: true,
      windowsMode: false,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);

    // Track modifier key state
    let isModifierPressed = false;

    const handleKeyDown = (e: KeyboardEvent) => {
      isModifierPressed = e.metaKey || e.ctrlKey;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      isModifierPressed = e.metaKey || e.ctrlKey;
    };

    keyDownHandlerRef.current = handleKeyDown;
    keyUpHandlerRef.current = handleKeyUp;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Register Link Provider for URLs (always show underline, open in browser)
    terminal.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) return;

        const text = line.translateToString(true);
        const links: any[] = [];

        // URL regex: matches http://, https://, and www. URLs
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

        let match;
        while ((match = urlRegex.exec(text)) !== null) {
          const url = match[1];
          const textIndex = match.index;

          links.push({
            range: {
              start: { x: textIndex + 1, y: bufferLineNumber },
              end: { x: textIndex + url.length + 1, y: bufferLineNumber }
            },
            text: url,
            activate: (event: MouseEvent, text: string) => {
              try {
                // Ensure URL has protocol
                const fullUrl = text.startsWith('http') ? text : `https://${text}`;
                // Open in internal browser component
                openBrowserWithUrl(fullUrl, text);
                toast.success(`Opening ${text} in browser`);
              } catch (err) {
                console.error('Failed to open URL:', err);
              }
            }
          });
        }

        callback(links);
      }
    });

    // Register Link Provider for file paths (only show underline with Ctrl/Cmd)
    terminal.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
        if (!line) return;

        const text = line.translateToString(true);
        const links: any[] = [];

        const fileRegex = /(?:^|\s)((?:(?:\.{0,2}\/|~\/|[\w\-\.]+\/)[\w\-\.\/]+)|(?:[\w\-\.]+\.(?:ts|tsx|js|jsx|json|md|py|go|rs|yml|yaml|html|css|scss)))(?=$|[\s"'])/g;

        let match;
        while ((match = fileRegex.exec(text)) !== null) {
          const filePath = match[1];
          const textIndex = match.index + match[0].indexOf(filePath);

          links.push({
            range: {
              start: { x: textIndex + 1, y: bufferLineNumber },
              end: { x: textIndex + filePath.length + 1, y: bufferLineNumber }
            },
            text: filePath,
            // Only show underline if modifier key is pressed
            hover: (event: MouseEvent, text: string) => {
              return isModifierPressed;
            },
            activate: (event: MouseEvent, text: string) => {
              try {
                const name = text.split('/').pop() || text;
                openEditorWithFile(text, name);
                toast.success(`Opening ${name}`);
              } catch (err) {
                console.error('Failed to open link:', err);
              }
            }
          });
        }

        callback(links);
      }
    });

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    terminal.open(terminalRef.current);

    // Initial fit
    setTimeout(() => {
      try {
        // Ensure terminal element is visible and has dimensions before fitting
        if (terminalRef.current && terminalRef.current.offsetParent !== null) {
          fitAddon.fit();
          const dimensions = fitAddon.proposeDimensions();
          if (dimensions) {
            invoke('resize_pty', {
              sessionId,
              cols: dimensions.cols,
              rows: dimensions.rows,
            }).catch(console.error);
          }
        }
      } catch (e) {
        console.error('Error fitting terminal:', e);
      }
    }, 100);

    // Handle user input
    terminal.onData((data) => {
      // Basic command capture - look for Enter key
      if (data === '\r' || data === '\n') {
        if (currentCommandRef.current.trim()) {
          updateSessionLastCommand(sessionId, currentCommandRef.current.trim());
        }
        currentCommandRef.current = '';
      } else if (data === '\u007f') { // Backspace
        currentCommandRef.current = currentCommandRef.current.slice(0, -1);
      } else {
        // Only append printable characters
        if (data.length === 1 && data.charCodeAt(0) >= 32) {
          currentCommandRef.current += data;
        }
      }

      invoke('write_to_pty', { sessionId, data }).catch((err) => {
        console.error('Error writing to PTY:', err);
      });
    });

    // Handle resize
    terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      invoke('resize_pty', { sessionId, cols, rows }).catch(console.error);
    });

    terminal.onSelectionChange(() => {
      const selection = terminal.getSelection();
      if (!selection) {
        setSelectionWidget(prev => ({ ...prev, visible: false }));
        setSelectedText('');
        return;
      }
      setSelectedText(selection);
    });

    setIsInitialized(true);
    terminal.focus();
  }, [sessionId, updateSessionLastCommand]);

  // Start polling for terminal output
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;

    pollIntervalRef.current = setInterval(async () => {
      if (!terminalInstanceRef.current) return;

      try {
        const output = await invoke<string>('read_from_pty', { sessionId });
        if (output && output.length > 0) {
          terminalInstanceRef.current.write(output);
        }
      } catch (err) {
        console.error('Error reading from PTY:', err);
      }
    }, 10); // Poll every 10ms for responsive terminal
  }, [sessionId]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Handle resize events
  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !isActive) return;

    try {
      fitAddonRef.current.fit();
      const dimensions = fitAddonRef.current.proposeDimensions();
      if (dimensions) {
        invoke('resize_pty', {
          sessionId,
          cols: dimensions.cols,
          rows: dimensions.rows,
        }).catch(console.error);
      }
    } catch (e) {
      console.error('Error resizing terminal:', e);
    }
  }, [sessionId, isActive]);

  // Initialize terminal on mount
  useEffect(() => {
    initTerminal();
    startPolling();
    registerTerminalInstance(sessionId, getTerminalLines);

    return () => {
      stopPolling();
      unregisterTerminalInstance(sessionId);
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
        terminalInstanceRef.current = null;
      }
      // Cleanup keyboard event listeners
      if (keyDownHandlerRef.current) {
        window.removeEventListener('keydown', keyDownHandlerRef.current);
      }
      if (keyUpHandlerRef.current) {
        window.removeEventListener('keyup', keyUpHandlerRef.current);
      }
    };
  }, [initTerminal, startPolling, stopPolling, sessionId, registerTerminalInstance, unregisterTerminalInstance, getTerminalLines]);

  // Handle visibility changes
  useEffect(() => {
    if (isActive && terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
      handleResize();
    }
  }, [isActive, handleResize]);

  // Window resize listener
  useEffect(() => {
    if (!isActive) return;

    window.addEventListener('resize', handleResize);

    // ResizeObserver for container size changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
    };
  }, [isActive, handleResize]);

  // Handle addition to chat from selection
  const handleAddToChat = useCallback(() => {
    if (selectedText) {
      addResourceContext({
        resourceType: 'terminal',
        resourceName: sessionName,
        namespace: '',
        namespaced: false,
        group: 'terminal',
        version: 'v1',
        resourceContent: selectedText
      });

      toast.success("Added to Chat", {
        description: "Selected terminal content added to chat context"
      });

      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.clearSelection();
      }
      setSelectionWidget({ x: 0, y: 0, visible: false });
      setSelectedText('');
    }
  }, [selectedText, sessionName, addResourceContext]);

  // Handle mouse up to position the widget
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      if (!terminalRef.current || !terminalRef.current.contains(e.target as Node)) {
        // If clicking outside widget and terminal, hide widget
        if (selectionWidgetRef.current && !selectionWidgetRef.current.contains(e.target as Node)) {
          setSelectionWidget(prev => ({ ...prev, visible: false }));
        }
        return;
      }

      // Small timeout to let xterm update selection
      setTimeout(() => {
        if (terminalInstanceRef.current && terminalInstanceRef.current.hasSelection()) {
          const terminalRect = terminalRef.current!.getBoundingClientRect();

          // Position relative to the terminal container
          const x = e.clientX - terminalRect.left;
          const y = e.clientY - terminalRect.top - 45; // 45px above mouse

          setSelectionWidget({
            x: Math.max(50, Math.min(x, terminalRect.width - 100)),
            y: Math.max(10, y),
            visible: true
          });
        }
      }, 50);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Handle terminal click to focus
  const handleClick = useCallback(() => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
    }
  }, []);

  return (
    <div
      className="relative w-full h-full"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      <div
        ref={terminalRef}
        className="w-full h-full bg-background/95 cursor-text"
        onClick={handleClick}
        style={{
          padding: '4px',
        }}
      />

      {selectionWidget.visible && (
        <div
          ref={selectionWidgetRef}
          className="absolute z-50 flex items-center gap-1 bg-black/90 backdrop-blur-md border border-white/10 rounded-lg p-1 shadow-2xl animate-in fade-in zoom-in duration-200"
          style={{
            left: `${selectionWidget.x}px`,
            top: `${selectionWidget.y}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-white hover:bg-white/10 flex items-center gap-1.5"
            onClick={handleAddToChat}
          >
            <AtSign className="h-3.5 w-3.5" />
            Chat
          </Button>
          <div className="w-[1px] h-4 bg-white/10 mx-0.5" />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-white hover:bg-white/10"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default TerminalTab;
