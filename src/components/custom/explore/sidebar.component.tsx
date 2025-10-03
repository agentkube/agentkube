// ExploreSidebar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCluster } from '@/contexts/clusterContext';
import { SidebarItem } from '@/types/sidebar';
import SidebarMenuItem from './sidebarmenuitem/sidebarmenuitem.components';
import FeatureSection from './featuresection/featuresection.components';
import ClusterDisplay from './clusterdisplay/clusterdisplay.component';

interface ExploreSidebarProps {
  items: SidebarItem[];
  expandedItems: string[];
  selectedItem: string | null;
  onItemClick: (itemId: string | null) => void;
  onExpandToggle: (itemId: string) => void;
}

const ExploreSidebar: React.FC<ExploreSidebarProps> = ({
  items,
  expandedItems,
  selectedItem,
  onItemClick,
  onExpandToggle,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { contexts, currentContext, setCurrentContext, refreshContexts } = useCluster();

  // Read collapsed state from localStorage on initial render
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+S (Mac) or Ctrl+S (Windows)
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 's')) {
        e.preventDefault(); 

        const sidebar = document.querySelector('[aria-label="Expand sidebar"], [aria-label="Collapse sidebar"]');
        if (sidebar) {
          (sidebar as HTMLElement).click();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Track expanded advanced features
  const [expandedFeatures, setExpandedFeatures] = useState<string[]>(() => {
    const saved = localStorage.getItem('advanced-features-expanded');
    return saved ? JSON.parse(saved) : [];
  });

  // Is advanced features section collapsed
  const [isAdvancedCollapsed, setIsAdvancedCollapsed] = useState(() => {
    const saved = localStorage.getItem('advanced-section-collapsed');
    return saved ? JSON.parse(saved) : true;
  });

  // Save collapse state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  // Save expanded features state
  useEffect(() => {
    localStorage.setItem('advanced-features-expanded', JSON.stringify(expandedFeatures));
  }, [expandedFeatures]);

  // Save advanced section collapsed state
  useEffect(() => {
    localStorage.setItem('advanced-section-collapsed', JSON.stringify(isAdvancedCollapsed));
  }, [isAdvancedCollapsed]);

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const toggleAdvancedCollapse = () => {
    setIsAdvancedCollapsed(!isAdvancedCollapsed);
  };

  // Toggle feature expansion
  const handleFeatureExpandToggle = (featureId: string) => {
    setExpandedFeatures(prev =>
      prev.includes(featureId)
        ? prev.filter(id => id !== featureId)
        : [...prev, featureId]
    );
  };

  // Handle feature click for navigation
  const handleFeatureClick = (feature: any) => {
    // When clicking on an advanced feature, clear the regular sidebar selection
    if (selectedItem) {
      onItemClick(null);
    }
    navigate(feature.path);
  };

  useEffect(() => {
    refreshContexts();
  }, [refreshContexts]);


  return (
    <div
      className={`flex flex-col border-r dark:border-gray-400/20 border-gray-200 transition-all duration-300 ${isCollapsed ? 'min-w-16 w-16' : 'min-w-64'
        }`}
    >
      <div className="flex items-center justify-between p-4">
        {!isCollapsed && (
          <div onClick={() => navigate('/dashboard')}>
            <h1 className="text-3xl dark:text-gray-500/50 hover:text-gray-500/80 dark:hover:text-gray-500/80 font-semibold hover:cursor-pointer">Overview</h1>
          </div>
        )}
        <button
          onClick={toggleCollapse}
          className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 dark:text-gray-500"
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <PanelLeft className="w-5 h-5" />
          ) : (
            <PanelLeftClose className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Current Cluster Display */}
      <ClusterDisplay
        isCollapsed={isCollapsed}
        currentContext={currentContext}
        contexts={contexts}
        setCurrentContext={setCurrentContext}
        navigate={navigate}
      />

      {/* Advanced Features Section */}
      <FeatureSection
        isCollapsed={isCollapsed}
        isAdvancedCollapsed={isAdvancedCollapsed}
        toggleAdvancedCollapse={toggleAdvancedCollapse}
        expandedFeatures={expandedFeatures}
        locationPathname={location.pathname}
        onFeatureClick={handleFeatureClick}
        onFeatureExpandToggle={handleFeatureExpandToggle}
      />

      {/* Resources Section */}
      <div className="text-xs font-medium text-gray-800 dark:text-gray-500 px-2 py-1">
        {!isCollapsed && "Resources"}
      </div>

      <div className="
        text-gray-800
        dark:text-gray-300 
        px-2
        w-full
        flex-1
        overflow-y-auto 
        overflow-x-hidden
        [&::-webkit-scrollbar]:w-2 
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-gray-400/20 
        [&::-webkit-scrollbar-thumb]:rounded-full
      ">
        {items.map((item) => (
          <SidebarMenuItem
            key={item.id}
            item={item}
            isExpanded={expandedItems.includes(item.id)}
            selectedItem={selectedItem}
            level={0}
            onItemClick={onItemClick}
            onExpandToggle={onExpandToggle}
            isCollapsed={isCollapsed}
          />
        ))}
      </div>
    </div>
  );
};


export default ExploreSidebar;


