import React, { useEffect, useRef, useState } from 'react';
import { Terminal as TerminalIcon, X } from 'lucide-react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { terminalApi } from '@/api/terminal';
import { useCluster } from '@/contexts/clusterContext';
import 'xterm/css/xterm.css';
import { highlightLsOutput } from '@/utils/terminal';

interface TerminalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TerminalComponent: React.FC<TerminalProps> = ({
  isOpen,
  onClose
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminalInstanceRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [focused, setFocused] = useState(false);
  const { currentContext } = useCluster();
  const commandBufferRef = useRef<string>('');
  const lastCommandTimeRef = useRef<number>(0);
  const lastCommandRef = useRef<string>('');
  const connectedRef = useRef<boolean>(false);
  const connectionIdRef = useRef<string | null>(null);

  const [terminalHeight, setTerminalHeight] = useState('40vh');
  const [isDragging, setIsDragging] = useState(false);
  const terminalHeaderRef = useRef<HTMLDivElement>(null);
  
  // Track if this is the initial connection
  const isInitialConnectionRef = useRef<boolean>(true);

  // Setup terminal instance
  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;

    if (!terminalInstanceRef.current) {
      const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        theme: {
          background: '#0F1015',
          foreground: '#f0f0f0',
          cursor: '#ffffff',
          black: '#000000',
          red: '#C51E14',
          green: '#1DC121',
          yellow: '#C7C329',
          blue: '#0A2FC4',
          magenta: '#C839C5',
          cyan: '#20C5C6',
          white: '#C7C7C7',
          brightBlack: '#686868',
          brightRed: '#FD6F6B',
          brightGreen: '#67F86F',
          brightYellow: '#FFFA72',
          brightBlue: '#6A76FB',
          brightMagenta: '#FD7CFC',
          brightCyan: '#68FDFE',
          brightWhite: '#FFFFFF',
        },
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        lineHeight: 1.2,
        scrollback: 1000,
        convertEol: true,
        disableStdin: false,
        allowTransparency: false,
        screenReaderMode: false,
      });

      // Add WebLinksAddon for clickable links
      term.loadAddon(new WebLinksAddon());

      const fit = new FitAddon();

      terminalInstanceRef.current = term;
      fitAddonRef.current = fit;

      return () => {
        if (term) {
          try {
            // Only close if we have a connection
            if (connectionIdRef.current) {
              terminalApi.closeConnection(connectionIdRef.current);
              connectionIdRef.current = null;
            }
            term.dispose();
            terminalInstanceRef.current = null;
            fitAddonRef.current = null;
          } catch (e) {
            console.error('Error disposing terminal:', e);
          }
        }
      };
    }
  }, [isOpen]);

  // Initialize terminal after it's created
  useEffect(() => {
    if (!isOpen || !terminalInstanceRef.current || !fitAddonRef.current || !terminalRef.current || initialized) return;

    try {
      const terminal = terminalInstanceRef.current;
      const fitAddon = fitAddonRef.current;

      terminal.options.disableStdin = false;
      terminal.options.cursorBlink = true;

      terminal.loadAddon(fitAddon);
      terminal.open(terminalRef.current);

      // Clear terminal and show it's ready
      terminal.clear();
      terminal.write('Connecting to terminal...\r\n');

      // Register onData handler right after opening
      terminal.onData((data) => {
        if (terminalApi.isConnected()) {
          const code = data.charCodeAt(0);

          if (data === '\r') {
            const command = commandBufferRef.current;
            lastCommandRef.current = command;

            if (command.trim() === 'clear') {
              terminal.write('\r\n');
              terminalApi.sendInput(command + '\n');
              commandBufferRef.current = '';
              return;
            }
            terminal.write('\r\n');
            terminalApi.sendInput(command + '\n');
            lastCommandTimeRef.current = Date.now();
            commandBufferRef.current = '';
          }

          else if (data === '\t') {
            terminalApi.sendInput('\t');
          }

          // Handle Backspace key
          else if (code === 127) {
            if (commandBufferRef.current.length > 0) {
              commandBufferRef.current = commandBufferRef.current.slice(0, -1);
              terminal.write('\b \b');
            }
          }

          else if (code >= 32) {
            commandBufferRef.current += data;
            terminal.write(data);
          }
          else {
            terminalApi.sendInput(data);
          }
        } else {
          terminal.write('\r\nNot connected to terminal server\r\n');
        }
      });

      // Focus the terminal immediately
      terminal.focus();

      setTimeout(() => {
        try {
          if (fitAddon && terminalRef.current) {
            fitAddon.fit();
            terminal.focus();
            setFocused(true);
            setInitialized(true);
          }
        } catch (e) {
          console.error('Error fitting terminal:', e);
        }
      }, 300);
    } catch (e) {
      console.error('Error initializing terminal:', e);
    }
  }, [isOpen, initialized]);

  // Connect to the terminal API - runs only once after initialization
  useEffect(() => {
    if (!initialized || !currentContext) {
      return;
    }

    // If already connected, don't reconnect
    if (terminalApi.isConnected() && connectionIdRef.current) {
      return;
    }

    const terminal = terminalInstanceRef.current;
    const fitAddon = fitAddonRef.current;
    
    if (!terminal) return;

    const handleMessage = (message: any) => {
      if (!terminal) return;
      lastCommandTimeRef.current = Date.now();

      if (message.type === 'stdout' || message.type === 'stderr') {
        try {
          let outputData;
          if (typeof message.data === 'string') {
            try {
              outputData = JSON.parse(message.data);
            } catch {
              outputData = message.data;
            }
          } else {
            outputData = message.data;
          }
          const outputStr = typeof outputData === 'string' ? outputData : JSON.stringify(outputData);

          if (outputStr.includes("stdin isn't a terminal")) {
            return;
          }

          if (outputStr.trim() !== '') {
            // Apply coloring for ls output
            let processedOutput = outputStr;

            const lastCmd = lastCommandRef.current.trim();
            if (lastCmd === 'ls' || lastCmd.startsWith('ls ')) {
              processedOutput = highlightLsOutput(outputStr);
            }

            terminal.write(processedOutput);
          }
        } catch (e) {
          console.error('Error writing to terminal:', e);
          terminal.write(String(message.data));
        }
      } else if (message.type === 'error') {
        terminal.write(`\r\nError: ${message.data}\r\n`);
      }
    };

    const handleOpen = () => {
      connectedRef.current = true;
      
      if (fitAddon) {
        const dimensions = fitAddon.proposeDimensions();
        if (dimensions) {
          terminalApi.sendResize(dimensions.cols, dimensions.rows);
        }
      }

      if (isInitialConnectionRef.current) {
        terminal.write('Terminal connected\r\n');
        isInitialConnectionRef.current = false;
      } else if (isOpen) {
        // If reconnecting while terminal is visible
        terminal.write('\r\nReconnected to terminal\r\n');
      }
    };

    const handleClose = () => {
      connectedRef.current = false;
      terminal.write('\r\nConnection closed.\r\n');
    };

    const handleError = (error: Event) => {
      connectedRef.current = false;
      terminal.write('\r\nConnection error. Please try again.\r\n');
    };

    // First, get the terminal API endpoint
    const protocol = window.location.protocol;
    const host = window.location.host;
    const baseUrl = `${protocol}//${host}`;
    const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
    
    // Create a session and then connect
    const createSessionAndConnect = async () => {
      try {
        // Get session from API
        const response = await fetch(`${baseUrl}${OPERATOR_URL}/terminal`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to create terminal session: ${response.statusText}`);
        }
        
        const session = await response.json();
        
        // Now create the WebSocket URL with the session credentials
        const wsUrl = `${wsProtocol}//${host}${OPERATOR_URL}/terminal?id=${encodeURIComponent(session.id)}&shellToken=${encodeURIComponent(session.shellToken)}`;
        
        // Connect to the WebSocket
        const connectionId = await terminalApi.connect(
          wsUrl,
          handleMessage,
          handleOpen,
          handleClose,
          handleError,
          { id: session.id, shellToken: session.shellToken }
        );
        
        connectionIdRef.current = connectionId;
        
        // Set up ping interval to keep connection alive
        const pingInterval = setInterval(() => {
          if (terminalApi.isConnected()) {
            terminalApi.sendPing();
          }
        }, 30000);

        return pingInterval;
      } catch (error) {
        console.error('Error creating terminal session:', error);
        terminal.write(`\r\nError creating terminal session: ${error}\r\n`);
        return null;
      }
    };

    let pingInterval: NodeJS.Timeout | null = null;
    
    createSessionAndConnect().then((interval) => {
      pingInterval = interval;
    });

    const handleResize = () => {
      if (fitAddon && terminalApi.isConnected() && isOpen) {
        try {
          fitAddon.fit();
          const dimensions = fitAddon.proposeDimensions();
          if (dimensions) {
            terminalApi.sendResize(dimensions.cols, dimensions.rows);
          }
        } catch (e) {
          console.error('Error during terminal resize:', e);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    setTimeout(handleResize, 200);

    // Cleanup function - only runs when component is unmounted, not when isOpen changes
    return () => {
      window.removeEventListener('resize', handleResize);
      if (pingInterval) {
        clearInterval(pingInterval);
      }
      
      // Do not close WebSocket connection here - we want to keep it alive
      // even when the terminal is hidden
    };
  }, [initialized, currentContext]);

  // Close WebSocket when component is unmounted
  useEffect(() => {
    return () => {
      if (connectionIdRef.current) {
        terminalApi.closeConnection(connectionIdRef.current);
        connectionIdRef.current = null;
      }
    };
  }, []);

  // Handle terminal updates when it becomes visible
  useEffect(() => {
    if (isOpen && initialized && terminalInstanceRef.current && fitAddonRef.current) {
      const terminal = terminalInstanceRef.current;
      const fitAddon = fitAddonRef.current;
      
      // When terminal becomes visible again, resize it
      setTimeout(() => {
        try {
          if (fitAddon) {
            fitAddon.fit();
            if (terminalApi.isConnected()) {
              const dimensions = fitAddon.proposeDimensions();
              if (dimensions) {
                terminalApi.sendResize(dimensions.cols, dimensions.rows);
              }
            }
          }
          terminal.focus();
        } catch (e) {
          console.error('Error during terminal visibility change:', e);
        }
      }, 200);
    }
  }, [isOpen, initialized]);

  // Effect to handle terminal resize when height changes
  useEffect(() => {
    if (initialized && fitAddonRef.current && terminalApi.isConnected() && isOpen) {
      setTimeout(() => {
        try {
          const fitAddon = fitAddonRef.current;
          if (fitAddon) {
            fitAddon.fit();
            const dimensions = fitAddon.proposeDimensions();
            if (dimensions) {
              terminalApi.sendResize(dimensions.cols, dimensions.rows);
            }
          }
        } catch (e) {
          console.error('Error during terminal resize after height change:', e);
        }
      }, 100);
    }
  }, [terminalHeight, initialized, isOpen]);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    const handleResize = (e: MouseEvent) => {
      if (isDragging) {
        // Calculate new height based on mouse position from top of window
        const viewportHeight = window.innerHeight;
        const mouseY = e.clientY;

        // Calculate terminal height as distance from bottom of screen to mouse
        // with a minimum height of 20vh and max of 80vh
        const heightFromBottom = viewportHeight - mouseY;
        const heightPercentage = Math.min(Math.max((heightFromBottom / viewportHeight) * 100, 20), 80);

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

  // Focus handling
  const handleTerminalClick = () => {
    if (terminalInstanceRef.current) {
      terminalInstanceRef.current.focus();
      setFocused(true);
    }
  };

  const handleFocus = () => {
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
  };

  // Handle terminal close properly - don't close the WebSocket
  const handleCloseClick = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black z-50" style={{ height: terminalHeight }}>
      {/* Resize handle at the top of the terminal */}
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-gray-900 cursor-ns-resize z-10 hover:bg-blue-600"
        onMouseDown={handleResizeStart}
      />

      <div
        ref={terminalHeaderRef}
        className="flex justify-between items-center p-2 bg-[#0F1015]"
      >
        <div className="flex items-center space-x-2">
          <TerminalIcon className="h-4 w-4 text-gray-300" />
          <span className="text-gray-300 text-sm font-medium">Terminal</span>
          {initialized && <span className={`text-xs ml-2 ${focused ? 'text-green-500' : 'text-yellow-500'}`}>●</span>}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCloseClick}
            className="text-gray-300 hover:text-white hover:bg-gray-700 p-1 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={terminalRef}
        className="w-full cursor-text overflow-y-auto
        [&::-webkit-scrollbar]:w-2 
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-gray-400/50 
        [&::-webkit-scrollbar-thumb]:rounded-full"
        style={{ height: `calc(${terminalHeight} - ${terminalHeaderRef.current?.offsetHeight || 40}px)` }}
        onClick={handleTerminalClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        tabIndex={0}
        onKeyDown={(e) => {
          // Prevent default behavior for terminal-related keys
          if (e.key === 'Tab' ||
            (e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'd'))) {
            e.preventDefault();
          }

          if (terminalInstanceRef.current) {
            terminalInstanceRef.current.focus();
          }
        }}
      />
    </div>
  );
};

export default TerminalComponent;