import { useState, useEffect } from 'react';

export const useBackgroundTask = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [resourceName, setResourceName] = useState<string>('');
  const [resourceType, setResourceType] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd (Meta) + E or Ctrl + E
      if ((event.metaKey || event.ctrlKey) && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        // Toggle the background task dialog instead of just opening it
        setIsOpen(prevState => !prevState);
        
        // If we're closing it, also reset the resource info
        if (isOpen) {
          setResourceName('');
          setResourceType('');
        }
      }

      // Close on escape
      if (event.key === 'Escape') {
        setIsOpen(false);
        setResourceName('');
        setResourceType('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]); // Add isOpen to dependency array

  const onClose = () => {
    setIsOpen(false);
    setResourceName('');
    setResourceType('');
  };

  const openWithResource = (name: string, type: string) => {
    setResourceName(name);
    setResourceType(type);
    setIsOpen(true);
  };

  return {
    isOpen,
    resourceName,
    resourceType,
    setResourceName,
    setResourceType,
    setIsOpen,
    onClose,
    openWithResource,
  };
};