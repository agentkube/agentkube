import React, { useState, useEffect, useCallback } from 'react';
import { Terminal } from 'lucide-react';
import TerminalManager from './terminal.component';

const TerminalContainer: React.FC = () => {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const toggleTerminal = useCallback(() => {
    setIsTerminalOpen((prev) => !prev);
  }, []);

  const closeTerminal = useCallback(() => {
    setIsTerminalOpen(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + ` (backtick) to toggle terminal
      if ((event.ctrlKey || event.metaKey) && event.key === '`') {
        event.preventDefault();
        toggleTerminal();
      }

      // Escape to close terminal when it's open
      if (event.key === 'Escape' && isTerminalOpen) {
        // Only close if not focused on an input or terminal
        const activeElement = document.activeElement;
        const isInTerminal = activeElement?.closest('.xterm');
        if (!isInTerminal) {
          closeTerminal();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTerminalOpen, toggleTerminal, closeTerminal]);

  return (
    <>
      <button
        className={`py-1 backdrop-blur-md flex items-center px-4 dark:text-gray-200 hover:bg-accent-hover space-x-1 transition-colors ${isTerminalOpen
          ? 'bg-accent text-foreground'
          : 'bg-gray-200 dark:bg-gray-600/20'
          }`}
        onClick={toggleTerminal}
        title="Toggle Terminal (⌃`)"
      >
        <Terminal className="h-3 w-3" />
        <span>Terminal</span>
        {isTerminalOpen && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        )}
      </button>

      <TerminalManager isOpen={isTerminalOpen} onClose={closeTerminal} />
    </>
  );
};

export default TerminalContainer;