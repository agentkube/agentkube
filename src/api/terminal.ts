/**
 * Terminal API service for managing multiple WebSocket connections
 */

import { OPERATOR_URL } from "@/config";

interface TerminalConnection {
  socket: WebSocket;
  isConnected: boolean;
  sessionId: string | null;
  shellToken: string | null;
}

interface TerminalSession {
  id: string;
  shellToken: string;
}

class TerminalApiService {
  private connections: Map<string, TerminalConnection> = new Map();
  private activeConnection: string | null = null;
  private baseUrl: string | null = null;
  private messageHandler: ((message: any) => void) | null = null;
  private openHandler: (() => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((event: Event) => void) | null = null;

  /**
   * Create a new terminal session
   */
  async createSession(): Promise<TerminalSession> {
    if (!this.baseUrl) {
      throw new Error('Base URL not set');
    }

    try {
      // Extract the base URL without the WebSocket protocol
      const baseUrlWithoutProtocol = this.baseUrl.replace(/^wss?:\/\//, '');
      const protocol = window.location.protocol;
      const httpUrl = `${protocol}//${baseUrlWithoutProtocol}`;

      const OPERATOR_WSS_URL = OPERATOR_URL.replace(/^ws?:\/\//, '');

      console.log("OPERATOR_WSS_URL", OPERATOR_WSS_URL)
      // Create a new session via HTTP request
      const response = await fetch(OPERATOR_WSS_URL, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to create terminal session: ${response.statusText}`);
      }

      const session = await response.json();
      return {
        id: session.id,
        shellToken: session.shellToken
      };
    } catch (error) {
      console.error('Error creating terminal session:', error);
      throw error;
    }
  }

  /**
   * Connect to the terminal WebSocket endpoint
   */
  async connect(
    url: string,
    onMessage: (message: any) => void,
    onOpen: () => void,
    onClose: () => void,
    onError: (event: Event) => void,
    existingSession?: TerminalSession
  ): Promise<string> {
    this.baseUrl = url;
    
    // Store the callback handlers
    this.messageHandler = onMessage;
    this.openHandler = onOpen;
    this.closeHandler = onClose;
    this.errorHandler = onError;

    let session: TerminalSession;
    let connectionId: string;
    
    try {
      // If an existing session is provided, use it; otherwise create a new one
      if (existingSession) {
        session = existingSession;
        connectionId = `terminal-${session.id}`;
      } else {
        session = await this.createSession();
        connectionId = `terminal-${session.id}`;
      }
      
      // If we already have a connection to this session, reuse it
      if (this.connections.has(connectionId)) {
        const connection = this.connections.get(connectionId);
        if (connection && connection.isConnected) {
          console.log('Reusing existing terminal connection:', connectionId);
          this.activeConnection = connectionId;
          // Notify that we're connected
          this.openHandler();
          return connectionId;
        } else {
          // Close the existing connection if it's not connected
          this.closeConnection(connectionId);
        }
      }

      // Build the WebSocket URL with session parameters
      // const wsUrl = `${url}?id=${encodeURIComponent(session.id)}&shellToken=${encodeURIComponent(session.shellToken)}`;
      
      // Create a new WebSocket connection
      const socket = new WebSocket(url);
      
      // Initialize the connection object
      this.connections.set(connectionId, {
        socket,
        isConnected: false,
        sessionId: session.id,
        shellToken: session.shellToken
      });
      
      this.activeConnection = connectionId;

      // Set up event handlers
      socket.onopen = () => {
        const connection = this.connections.get(connectionId);
        if (connection) {
          connection.isConnected = true;
          this.connections.set(connectionId, connection);
          if (this.openHandler) {
            this.openHandler();
          }
        }
      };

      socket.onmessage = (event) => {
        if (this.messageHandler) {
          try {
            const data = JSON.parse(event.data);
            this.messageHandler(data);
          } catch (error) {
            console.error('Error parsing terminal message:', error);
            this.messageHandler({ type: 'error', data: 'Invalid message format' });
          }
        }
      };

      socket.onclose = () => {
        const connection = this.connections.get(connectionId);
        if (connection) {
          connection.isConnected = false;
          this.connections.set(connectionId, connection);
          if (this.closeHandler) {
            this.closeHandler();
          }
        }
      };

      socket.onerror = (event) => {
        if (this.errorHandler) {
          this.errorHandler(event);
        }
      };

      return connectionId;
    } catch (error) {
      console.error('Error connecting to terminal:', error);
      if (this.errorHandler) {
        this.errorHandler(new ErrorEvent('error', { error: error as Error, message: 'Failed to connect to terminal' }));
      }
      throw error;
    }
  }

  /**
   * Get details for the active connection
   */
  getActiveSession(): TerminalSession | null {
    if (!this.activeConnection || !this.connections.has(this.activeConnection)) {
      return null;
    }

    const connection = this.connections.get(this.activeConnection);
    if (!connection || !connection.sessionId || !connection.shellToken) {
      return null;
    }

    return {
      id: connection.sessionId,
      shellToken: connection.shellToken
    };
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): TerminalSession[] {
    const sessions: TerminalSession[] = [];
    
    for (const [_, connection] of this.connections.entries()) {
      if (connection.sessionId && connection.shellToken) {
        sessions.push({
          id: connection.sessionId,
          shellToken: connection.shellToken
        });
      }
    }
    
    return sessions;
  }

  /**
   * Switch to a different terminal connection
   */
  switchConnection(connectionId: string): boolean {
    if (this.connections.has(connectionId)) {
      this.activeConnection = connectionId;
      return true;
    }
    return false;
  }

  /**
   * Create a new terminal connection
   */
  async createConnection(
    onMessage: (message: any) => void,
    onOpen: () => void,
    onClose: () => void,
    onError: (event: Event) => void
  ): Promise<string> {
    if (!this.baseUrl) {
      throw new Error('Base URL not set, call connect() first');
    }
    
    return this.connect(
      this.baseUrl,
      onMessage,
      onOpen,
      onClose,
      onError
    );
  }

  /**
   * Send input to the active terminal
   */
  sendInput(data: string): void {
    if (!this.activeConnection || !this.connections.has(this.activeConnection)) {
      console.error('Cannot send input: no active terminal connection');
      return;
    }

    const connection = this.connections.get(this.activeConnection);
    if (!connection || !connection.isConnected) {
      console.error('Cannot send input: terminal not connected');
      return;
    }

    try {
      connection.socket.send(JSON.stringify({
        type: 'stdin',
        data
      }));
    } catch (error) {
      console.error('Error sending input to terminal:', error);
    }
  }

  /**
   * Send resize event to the active terminal
   */
  sendResize(cols: number, rows: number): void {
    if (!this.activeConnection || !this.connections.has(this.activeConnection)) {
      return;
    }

    const connection = this.connections.get(this.activeConnection);
    if (!connection || !connection.isConnected) {
      return;
    }

    try {
      const resizeData = JSON.stringify({ width: cols, height: rows });
      connection.socket.send(JSON.stringify({
        type: 'resize',
        data: resizeData
      }));
    } catch (error) {
      console.error('Error sending resize to terminal:', error);
    }
  }

  /**
   * Send ping to the active terminal to keep the connection alive
   */
  sendPing(): void {
    if (!this.activeConnection || !this.connections.has(this.activeConnection)) {
      return;
    }

    const connection = this.connections.get(this.activeConnection);
    if (!connection || !connection.isConnected) {
      return;
    }

    try {
      connection.socket.send(JSON.stringify({
        type: 'ping',
        data: ''
      }));
    } catch (error) {
      console.error('Error sending ping to terminal:', error);
    }
  }

  /**
   * Check if the active terminal is connected
   */
  isConnected(): boolean {
    if (!this.activeConnection || !this.connections.has(this.activeConnection)) {
      return false;
    }

    const connection = this.connections.get(this.activeConnection);
    return connection ? connection.isConnected : false;
  }

  /**
   * Send close command to the active terminal session
   */
  sendClose(): void {
    if (!this.activeConnection || !this.connections.has(this.activeConnection)) {
      return;
    }

    const connection = this.connections.get(this.activeConnection);
    if (!connection || !connection.isConnected) {
      return;
    }

    try {
      connection.socket.send(JSON.stringify({
        type: 'close',
        data: ''
      }));
    } catch (error) {
      console.error('Error sending close command to terminal:', error);
    }
  }

  /**
   * Close a specific terminal connection
   */
  closeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      try {
        // Send the close message before closing the socket
        if (connection.isConnected) {
          connection.socket.send(JSON.stringify({
            type: 'close',
            data: ''
          }));
        }
        connection.socket.close();
      } catch (error) {
        console.error(`Error closing terminal connection ${connectionId}:`, error);
      } finally {
        this.connections.delete(connectionId);
        if (this.activeConnection === connectionId) {
          this.activeConnection = null;
        }
      }
    }
  }

  /**
   * Close the active terminal connection
   */
  close(): void {
    if (this.activeConnection) {
      this.closeConnection(this.activeConnection);
    }
  }

  /**
   * Close all terminal connections
   */
  closeAll(): void {
    for (const connectionId of this.connections.keys()) {
      this.closeConnection(connectionId);
    }
    this.connections.clear();
    this.activeConnection = null;
  }
}

export const terminalApi = new TerminalApiService();