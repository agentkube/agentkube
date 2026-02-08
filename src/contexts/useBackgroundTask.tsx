import { useState, useEffect } from 'react';

// Global flag to ensure only one listener is active
let listenerActive = false;

export const useBackgroundTask = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [resourceName, setResourceName] = useState<string>('');
  const [resourceType, setResourceType] = useState<string>('');

  useEffect(() => {
    // Only attach listener if none exists
    if (listenerActive) return;
    
    listenerActive = true;
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 'e' || event.key === 'E')) {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(prevState => !prevState);
      }
  
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        setResourceName('');
        setResourceType('');
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      listenerActive = false;
    };
  }, []);

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