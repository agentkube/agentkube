import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { invoke } from '@tauri-apps/api/core';
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
  background: '#0F1015',
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
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize the terminal instance
  const initTerminal = useCallback(() => {
    if (!terminalRef.current || terminalInstanceRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      theme: defaultTheme,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
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

    terminalInstanceRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    terminal.open(terminalRef.current);

    // Initial fit
    setTimeout(() => {
      try {
        fitAddon.fit();
        const dimensions = fitAddon.proposeDimensions();
        if (dimensions) {
          invoke('resize_pty', {
            sessionId,
            cols: dimensions.cols,
            rows: dimensions.rows,
          }).catch(console.error);
        }
      } catch (e) {
        console.error('Error fitting terminal:', e);
      }
    }, 100);

    // Handle user input
    terminal.onData((data) => {
      invoke('write_to_pty', { sessionId, data }).catch((err) => {
        console.error('Error writing to PTY:', err);
      });
    });

    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      invoke('resize_pty', { sessionId, cols, rows }).catch(console.error);
    });

    setIsInitialized(true);
    terminal.focus();
  }, [sessionId]);

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

    return () => {
      stopPolling();
      if (terminalInstanceRef.current) {
        terminalInstanceRef.current.dispose();
        terminalInstanceRef.current = null;
      }
    };
  }, [initTerminal, startPolling, stopPolling]);

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

  // Handle terminal click to focus
  const handleClick = useCallback(() => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
    }
  }, []);

  return (
    <div
      ref={terminalRef}
      className={`w-full h-full cursor-text ${!isActive ? 'hidden' : ''}`}
      onClick={handleClick}
      style={{
        display: isActive ? 'block' : 'none',
        padding: '4px',
      }}
    />
  );
};

export default TerminalTab;
