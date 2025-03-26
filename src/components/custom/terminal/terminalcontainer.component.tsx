import React, { useState, useEffect } from 'react';
import { Terminal } from 'lucide-react';
import TerminalComponent from './terminal.component';

const TerminalContainer: React.FC = () => {
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);

  const toggleTerminal = () => {
    setIsTerminalOpen(!isTerminalOpen);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl + ~ (key code 192 is for the backtick/tilde key)
      if (event.ctrlKey && event.keyCode === 192) {
        toggleTerminal();
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isTerminalOpen]);

  return (
    <>
      <button 
        className="py-0.5 flex items-center px-4 bg-gray-200 dark:text-gray-200 dark:bg-gray-900 hover:bg-gray-800/50 space-x-1"
        onClick={toggleTerminal}
      >
        <Terminal className='h-3 w-3' /> 
        <span>Terminal</span>
      </button>
      
      <TerminalComponent 
        isOpen={isTerminalOpen} 
        onClose={() => setIsTerminalOpen(false)} 
      />
    </>
  );
};

export default TerminalContainer;