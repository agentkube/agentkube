import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import RightDrawer from '@/components/custom/chat/rightdrawer.components';

// Define the type for the context value
interface DrawerContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleDrawer: () => void;
}

// Create a more meaningful initial state with a noop function that doesn't just log
const initialState: DrawerContextType = {
  isOpen: false,
  setIsOpen: () => {}, // Empty function as placeholder
  toggleDrawer: () => {}, // Empty function as placeholder
};

const DrawerContext = createContext<DrawerContextType>(initialState);

export const useDrawer = (): DrawerContextType => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return context;
};

interface DrawerProviderProps {
  children: ReactNode;
}

export const DrawerProvider: React.FC<DrawerProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  
  // Use useCallback to memoize the function to prevent unnecessary rerenders
  const handleSetIsOpen = useCallback((open: boolean) => {
    try {
      console.log("Drawer state changing to:", open); // Helpful for debugging
      setIsOpen(open);
    } catch (error) {
      console.error("Error updating drawer state:", error);
    }
  }, []);

  // Toggle drawer function
  const toggleDrawer = useCallback(() => {
    try {
      console.log("Toggling drawer state from:", isOpen, "to", !isOpen);
      setIsOpen(prevState => !prevState);
    } catch (error) {
      console.error("Error toggling drawer state:", error);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Command+L (Mac) or Ctrl+L (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault(); // Prevent default browser behavior (like focusing address bar)
        toggleDrawer(); // Toggle the drawer instead of just opening it
      }
    };

    // Add the event listener to document
    document.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleDrawer]);

  return (
    <DrawerContext.Provider value={{ isOpen, setIsOpen: handleSetIsOpen, toggleDrawer }}>
      {children}
      <RightDrawer />
    </DrawerContext.Provider>
  );
};

export default DrawerContext;