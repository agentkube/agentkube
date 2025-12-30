import React, { createContext, useContext, useState, useCallback, ReactNode, useRef } from 'react';

interface TerminalRequest {
  command?: string;
  name?: string;
}

interface BrowserRequest {
  url: string;
  name?: string;
}

interface EditorRequest {
  filePath: string;
  name?: string;
  content?: string;
}

export interface TerminalSession {
  id: string;
  name: string;
  session_type: 'Local' | { K8s: { pod: string; container: string; namespace: string } };
  created_at: number;
  last_command?: string;
}

export interface BrowserSession {
  id: string;
  name: string;
  url: string;
  created_at: number;
}

export interface EditorSession {
  id: string;
  name: string;
  filePath: string;
  content?: string;
  hasUnsavedChanges?: boolean;
  created_at: number;
}

export type Session =
  | { type: 'terminal'; data: TerminalSession }
  | { type: 'browser'; data: BrowserSession }
  | { type: 'editor'; data: EditorSession };

interface TerminalContextType {
  isTerminalOpen: boolean;
  openTerminal: () => void;
  closeTerminal: () => void;
  toggleTerminal: () => void;
  openTerminalWithCommand: (command: string, name?: string) => void;
  pendingRequest: TerminalRequest | null;
  clearPendingRequest: () => void;
  // Session management
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  updateSessionLastCommand: (sessionId: string, command: string) => void;
  getTerminalContent: (sessionId: string) => string;
  registerTerminalInstance: (sessionId: string, getLines: () => string) => void;
  unregisterTerminalInstance: (sessionId: string) => void;
  // Browser functionality
  openBrowserWithUrl: (url: string, name?: string) => void;
  pendingBrowserRequest: BrowserRequest | null;
  clearPendingBrowserRequest: () => void;
  // Editor functionality
  openEditorWithFile: (filePath: string, name?: string, content?: string) => void;
  pendingEditorRequest: EditorRequest | null;
  clearPendingEditorRequest: () => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

interface TerminalProviderProps {
  children: ReactNode;
}

export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children }) => {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<TerminalRequest | null>(null);
  const [pendingBrowserRequest, setPendingBrowserRequest] = useState<BrowserRequest | null>(null);
  const [pendingEditorRequest, setPendingEditorRequest] = useState<EditorRequest | null>(null);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const terminalInstances = useRef<Record<string, () => string>>({});

  const openTerminal = useCallback(() => {
    setIsTerminalOpen(true);
  }, []);

  const closeTerminal = useCallback(() => {
    setIsTerminalOpen(false);
  }, []);

  const toggleTerminal = useCallback(() => {
    setIsTerminalOpen((prev) => !prev);
  }, []);

  const openTerminalWithCommand = useCallback((command: string, name?: string) => {
    setPendingRequest({ command, name });
    setIsTerminalOpen(true);
  }, []);

  const clearPendingRequest = useCallback(() => {
    setPendingRequest(null);
  }, []);

  const updateSessionLastCommand = useCallback((sessionId: string, command: string) => {
    setSessions(prev => prev.map(s => {
      if (s.type === 'terminal' && s.data.id === sessionId) {
        return { ...s, data: { ...s.data, last_command: command } };
      }
      return s;
    }));
  }, []);

  const registerTerminalInstance = useCallback((sessionId: string, getLines: () => string) => {
    terminalInstances.current[sessionId] = getLines;
  }, []);

  const unregisterTerminalInstance = useCallback((sessionId: string) => {
    delete terminalInstances.current[sessionId];
  }, []);

  const getTerminalContent = useCallback((sessionId: string) => {
    const getter = terminalInstances.current[sessionId];
    return getter ? getter() : '';
  }, []);

  const openBrowserWithUrl = useCallback((url: string, name?: string) => {
    setPendingBrowserRequest({ url, name });
    setIsTerminalOpen(true);
  }, []);

  const clearPendingBrowserRequest = useCallback(() => {
    setPendingBrowserRequest(null);
  }, []);

  const openEditorWithFile = useCallback((filePath: string, name?: string, content?: string) => {
    setPendingEditorRequest({ filePath, name, content });
    setIsTerminalOpen(true);
  }, []);

  const clearPendingEditorRequest = useCallback(() => {
    setPendingEditorRequest(null);
  }, []);

  return (
    <TerminalContext.Provider
      value={{
        isTerminalOpen,
        openTerminal,
        closeTerminal,
        toggleTerminal,
        openTerminalWithCommand,
        pendingRequest,
        clearPendingRequest,
        sessions,
        setSessions,
        activeSessionId,
        setActiveSessionId,
        updateSessionLastCommand,
        getTerminalContent,
        registerTerminalInstance,
        unregisterTerminalInstance,
        openBrowserWithUrl,
        pendingBrowserRequest,
        clearPendingBrowserRequest,
        openEditorWithFile,
        pendingEditorRequest,
        clearPendingEditorRequest,
      }}
    >
      {children}
    </TerminalContext.Provider>
  );
};

export const useTerminal = (): TerminalContextType => {
  const context = useContext(TerminalContext);
  if (context === undefined) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
};

export default TerminalContext;
