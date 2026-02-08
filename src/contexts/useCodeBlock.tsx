import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface CodeBlockSession {
  id: string;
  language: string;
  content: string;
  created_at: number;
}

interface CodeBlockContextType {
  codeBlocks: CodeBlockSession[];
  registerCodeBlock: (id: string, content: string, language: string) => void;
  unregisterCodeBlock: (id: string) => void;
  getCodeBlockContent: (id: string) => string | undefined;
}

const CodeBlockContext = createContext<CodeBlockContextType | undefined>(undefined);

export const CodeBlockProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [codeBlocks, setCodeBlocks] = useState<CodeBlockSession[]>([]);

  const registerCodeBlock = useCallback((id: string, content: string, language: string) => {
    setCodeBlocks(prev => {
      // Check if block already exists and content is same
      const exists = prev.find(cb => cb.id === id);
      if (exists && exists.content === content) return prev;

      const newBlock = { id, content, language, created_at: Date.now() };

      if (exists) {
        // Update existing block
        return prev.map(cb => cb.id === id ? newBlock : cb);
      }

      // Add new block
      return [...prev, newBlock];
    });
  }, []);

  const unregisterCodeBlock = useCallback((id: string) => {
    setCodeBlocks(prev => prev.filter(cb => cb.id !== id));
  }, []);

  const getCodeBlockContent = useCallback((id: string) => {
    return codeBlocks.find(cb => cb.id === id)?.content;
  }, [codeBlocks]);

  return (
    <CodeBlockContext.Provider value={{ codeBlocks, registerCodeBlock, unregisterCodeBlock, getCodeBlockContent }}>
      {children}
    </CodeBlockContext.Provider>
  );
};

export const useCodeBlock = (): CodeBlockContextType => {
  const context = useContext(CodeBlockContext);
  if (context === undefined) {
    throw new Error('useCodeBlock must be used within a CodeBlockProvider');
  }
  return context;
};

export default CodeBlockContext;
