import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const useSpotlight = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();



  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd (Meta) + K
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        // Toggle the spotlight instead of just opening it
        setIsOpen(prevState => !prevState);
        
        // If we're closing it, also reset the query
        if (isOpen) {
          setQuery('');
        }
      }

      // Check for Cmd (Meta)/Ctrl + D
      if ((event.metaKey || event.ctrlKey) && event.key === 'd') {
        event.preventDefault();
        navigate("/")
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

  return {
    isOpen,
    query,
    setQuery,
    onClose,
  };
};