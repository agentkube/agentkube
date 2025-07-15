// contexts/useProvision.tsx
import { useState, useEffect } from 'react';

export const useProvision = () => {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Cmd (Meta) + B or Ctrl + B
      if ((event.metaKey || event.ctrlKey) && (event.key === 'B' || event.key === 'b')) {
        event.preventDefault();
        setIsOpen(prevState => !prevState);
      }

      // Close on escape
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const onClose = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    onClose,
  };
};