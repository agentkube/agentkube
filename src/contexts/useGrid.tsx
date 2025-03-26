import React, { createContext, useContext, useState, useCallback } from 'react';

interface GridItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  component: React.ReactNode;
}

interface GridContextType {
  items: GridItem[];
  addItem: (item: GridItem) => void;
  updateItemPosition: (id: string, x: number, y: number) => void;
  updateItemSize: (id: string, w: number, h: number) => void;
  removeItem: (id: string) => void;
}

const GridContext = createContext<GridContextType | undefined>(undefined);

export const GridProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<GridItem[]>([]);

  const addItem = useCallback((item: GridItem) => {
    setItems(prev => [...prev, item]);
  }, []);

  const updateItemPosition = useCallback((id: string, x: number, y: number) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, x, y } : item
      )
    );
  }, []);

  const updateItemSize = useCallback((id: string, w: number, h: number) => {
    setItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, w, h } : item
      )
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  }, []);

  return (
    <GridContext.Provider value={{
      items,
      addItem,
      updateItemPosition,
      updateItemSize,
      removeItem
    }}>
      {children}
    </GridContext.Provider>
  );
};

export const useGrid = () => {
  const context = useContext(GridContext);
  if (!context) {
    throw new Error('useGrid must be used within a GridProvider');
  }
  return context;
};