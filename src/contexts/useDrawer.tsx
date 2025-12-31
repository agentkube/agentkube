import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import RightDrawer from '@/components/custom/chat/rightdrawer.components';
import { EnrichedSearchResult } from '@/types/search';

// Define the type for the context value
interface DrawerContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  addResourceContext: (resource: EnrichedSearchResult) => void;
  resourceContextToAdd: EnrichedSearchResult | null;
  clearResourceContextToAdd: () => void;
  addStructuredContent: (content: string, title?: string) => void;
  structuredContentToAdd: { content: string, title?: string } | null;
  clearStructuredContentToAdd: () => void;
  addMention: (mention: string) => void;
  mentionToAdd: string | null;
  clearMentionToAdd: () => void;
}

// Create a more meaningful initial state with a noop function that doesn't just log
const initialState: DrawerContextType = {
  isOpen: false,
  setIsOpen: () => { }, // Empty function as placeholder
  toggleDrawer: () => { }, // Empty function as placeholder
  addResourceContext: () => { },
  resourceContextToAdd: null,
  clearResourceContextToAdd: () => { },
  addStructuredContent: () => { },
  structuredContentToAdd: null,
  clearStructuredContentToAdd: () => { },
  addMention: () => { },
  mentionToAdd: null,
  clearMentionToAdd: () => { },
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
  const [resourceContextToAdd, setResourceContextToAdd] = useState<EnrichedSearchResult | null>(null);
  const [structuredContentToAdd, setStructuredContentToAdd] = useState<{ content: string, title?: string } | null>(null);
  const [mentionToAdd, setMentionToAdd] = useState<string | null>(null);

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

  // Add resource context function
  const addResourceContext = useCallback((resource: EnrichedSearchResult) => {
    try {
      setResourceContextToAdd(resource);
      // Don't automatically open the drawer, just set the context
    } catch (error) {
      console.error("Error adding resource context:", error);
    }
  }, []);

  // Clear resource context function
  const clearResourceContextToAdd = useCallback(() => {
    setResourceContextToAdd(null);
  }, []);

  // Add structured content function
  const addStructuredContent = useCallback((content: string, title?: string) => {
    try {
      setStructuredContentToAdd({ content, title });
    } catch (error) {
      console.error("Error adding structured content:", error);
    }
  }, []);

  // Clear structured content function
  const clearStructuredContentToAdd = useCallback(() => {
    setStructuredContentToAdd(null);
  }, []);

  // Add mention function
  const addMention = useCallback((mention: string) => {
    try {
      setMentionToAdd(mention);
      // Ensure drawer is open when adding mention
      setIsOpen(true);
    } catch (error) {
      console.error("Error adding mention:", error);
    }
  }, []);

  // Clear mention function
  const clearMentionToAdd = useCallback(() => {
    setMentionToAdd(null);
  }, []);

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
    <DrawerContext.Provider value={{
      isOpen,
      setIsOpen: handleSetIsOpen,
      toggleDrawer,
      addResourceContext,
      resourceContextToAdd,
      clearResourceContextToAdd,
      addStructuredContent,
      structuredContentToAdd,
      clearStructuredContentToAdd,
      addMention,
      mentionToAdd,
      clearMentionToAdd
    }}>
      {children}
      <RightDrawer />
    </DrawerContext.Provider>
  );
};

export default DrawerContext;