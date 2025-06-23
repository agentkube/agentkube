import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ExploreSidebar } from '@/components/custom';
import { sidebarItems } from '@/constants/kubernetes-resource.constants';

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Initialize state from localStorage or from URL path
  const [selectedItem, setSelectedItem] = useState<string | null>(() => {
    const saved = localStorage.getItem('sidebar-selected-item');
    if (saved) return JSON.parse(saved);
    
    // Extract from current path as fallback
    const pathParts = location.pathname.split('/');
    if (pathParts.length > 2 && pathParts[1] === 'explore') {
      return pathParts[2];
    }
    
    return null;
  });
  
  const [expandedItems, setExpandedItems] = useState<string[]>(() => {
    const saved = localStorage.getItem('sidebar-expanded-items');
    return saved ? JSON.parse(saved) : [];
  });

  // Persist state changes to localStorage
  useEffect(() => {
    localStorage.setItem('sidebar-selected-item', JSON.stringify(selectedItem));
  }, [selectedItem]);
  
  useEffect(() => {
    localStorage.setItem('sidebar-expanded-items', JSON.stringify(expandedItems));
  }, [expandedItems]);

  // Update selected item when URL changes
  useEffect(() => {
    const pathParts = location.pathname.split('/');
    if (pathParts.length > 2 && pathParts[1] === 'explore') {
      const itemId = pathParts[2];
      if (selectedItem !== itemId) {
        setSelectedItem(itemId);
      }
    }
  }, [location.pathname, selectedItem]);

  // Updated to handle null values
  const handleItemClick = (itemId: string | null) => {
    setSelectedItem(itemId);

    // Only navigate if itemId is not null
    if (itemId !== null) {
      navigate(`/dashboard/explore/${itemId}`);
    }
  };

  const handleExpandToggle = (itemId: string) => {
    setExpandedItems(prev =>
      prev.includes(itemId)
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  return (
    <div className="flex h-[93vh] overflow-hidden">
      <ExploreSidebar
        items={sidebarItems}
        expandedItems={expandedItems}
        selectedItem={selectedItem}
        onItemClick={handleItemClick}
        onExpandToggle={handleExpandToggle}
      />
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

export default Dashboard;