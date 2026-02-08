import { useState, useEffect } from 'react';

export const usePromQL = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd (Meta) + P or Ctrl + P
      if ((event.metaKey || event.ctrlKey) && (event.key === 'p' || event.key === 'P')) {
        event.preventDefault();
        // Toggle the PromQL spotlight instead of just opening it
        setIsOpen(prevState => !prevState);
        
        // If we're closing it, also reset the query
        if (isOpen) {
          setQuery('');
        }
      }

      // Close on escape
      if (event.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]); // Add isOpen to dependency array

  const onClose = () => {
    setIsOpen(false);
    setQuery('');
  };

  const executeQuery = (promqlQuery: string) => {
    // This will be implemented later
    console.log('Executing PromQL query:', promqlQuery);
    // You can add your PromQL execution logic here
  };

  return {
    isOpen,
    query,
    setQuery,
    onClose,
    executeQuery,
  };
};