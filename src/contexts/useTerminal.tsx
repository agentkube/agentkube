import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface TerminalRequest {
  command?: string;
  name?: string;
}

interface TerminalContextType {
  isTerminalOpen: boolean;
  openTerminal: () => void;
  closeTerminal: () => void;
  toggleTerminal: () => void;
  openTerminalWithCommand: (command: string, name?: string) => void;
  pendingRequest: TerminalRequest | null;
  clearPendingRequest: () => void;
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined);

interface TerminalProviderProps {
  children: ReactNode;
}

export const TerminalProvider: React.FC<TerminalProviderProps> = ({ children }) => {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<TerminalRequest | null>(null);

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
