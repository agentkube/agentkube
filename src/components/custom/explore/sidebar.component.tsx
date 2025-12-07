// ExploreSidebar.tsx
import React, { useState, useEffect, useRef } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCluster } from '@/contexts/clusterContext';
import { SidebarItem } from '@/types/sidebar';
import FeatureSection from './featuresection/featuresection.components';
import ClusterDisplay from './clusterdisplay/clusterdisplay.component';
import { TreeProvider, TreeView, TreeNode, TreeNodeTrigger, TreeNodeContent, TreeExpander, TreeIcon, TreeLabel } from '@/components/ui/tree';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

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

  // Convert current selected item to array format for tree
  const getSelectedItemIds = () => {
    return selectedItem ? [selectedItem] : [];
  };

  // Handle regular sidebar item selection
  const handleItemSelection = (nodeIds: string[]) => {
    if (nodeIds.length === 0) {
      onItemClick(null);
      return;
    }

    const nodeId = nodeIds[0];

    // Find the item by ID (check both parent and child items)
    const findItemById = (sidebarItems: SidebarItem[], targetId: string): SidebarItem | null => {
      for (const item of sidebarItems) {
        if (item.id === targetId) {
          return item;
        }
        if (item.children) {
          for (const child of item.children) {
            if (child.id === targetId) {
              return child;
            }
          }
        }
      }
      return null;
    };

    const selectedItem = findItemById(items, nodeId);
    if (selectedItem) {
      const hasChildren = selectedItem.children && selectedItem.children.length > 0;

      if (hasChildren && selectedItem.children) {
        // If parent has multiple children, don't navigate - just expand
        if (selectedItem.children.length > 1) {
          return; // Don't navigate, just expand/collapse
        } else {
          // If parent has single child, navigate to the child
          onItemClick(selectedItem.children[0].id);
          return;
        }
      } else {
        // Leaf item - navigate normally
        onItemClick(nodeId);
        return;
      }
    }

    // Fallback
    onItemClick(nodeId);
  };

  // Render sidebar items using tree components
  const renderSidebarNode = (item: SidebarItem, level: number = 0, isLast: boolean = false) => {
    const hasChildren = item.children && item.children.length > 0;

    return (
      <TreeNode key={item.id} nodeId={item.id} level={level} isLast={isLast}>
        <TreeNodeTrigger>
          <TreeExpander hasChildren={hasChildren} />
          <TreeIcon icon={item.icon} hasChildren={hasChildren} />
          {/* {level === 0 && <TreeIcon icon={item.icon} hasChildren={hasChildren} />} */}
          <TreeLabel className='text-xs'>{item.label}</TreeLabel>
        </TreeNodeTrigger>
        {hasChildren && (
          <TreeNodeContent hasChildren={hasChildren}>
            {item.children?.map((child, index) =>
              renderSidebarNode(child, level + 1, index === (item.children?.length || 0) - 1)
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    );
  };

  useEffect(() => {
    refreshContexts();
  }, [refreshContexts]);


  return (
    <div
      className={`flex flex-col mt-1  border-r border-border transition-all duration-300 bg-sidebar ${isCollapsed ? 'min-w-16 w-16' : 'min-w-64'}
        }`}
    >
      <div className="flex items-center justify-between p-4">
        {!isCollapsed && (
          <div onClick={() => navigate('/dashboard')}>
            <h1 className="text-3xl text-muted-foreground hover:text-foreground font-semibold hover:cursor-pointer">Overview</h1>
          </div>
        )}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleCollapse}
                className="p-1 rounded-md hover:bg-accent text-muted-foreground"
                aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? (
                  <PanelLeft className="w-5 h-5" />
                ) : (
                  <PanelLeftClose className="w-5 h-5" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent className="py-1 px-2 flex gap-1 dark:bg-gray-800 dark:text-gray-300" side="right">
              <p>{isCollapsed ? "Expand" : "Close"} Sidebar <span className='bg-secondary px-0.5 rounded-sm text-xs'>⌘</span> + <span className='bg-secondary px-1 rounded-sm text-xs'>S</span> </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
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
      <div className="text-xs font-medium text-muted-foreground px-2 py-1">
        {!isCollapsed && "Resources"}
      </div>

      <div className="
        text-foreground 
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
        {!isCollapsed ? (
          <TreeProvider
            defaultExpandedIds={expandedItems}
            selectedIds={getSelectedItemIds()}
            onSelectionChange={handleItemSelection}
            showLines={true}
            showIcons={true}
            selectable={true}
            multiSelect={false}
            indent={16}
            animateExpand={true}
          >
            <TreeView className="p-0">
              {items.map((item, index) =>
                renderSidebarNode(item, 0, index === items.length - 1)
              )}
            </TreeView>
          </TreeProvider>
        ) : (
          // Collapsed view - show icons with dropdowns for parents
          <div className="space-y-1">
            {items.map((item) => {
              const hasChildren = item.children && item.children.length > 0;

              if (hasChildren) {
                return (
                  <div key={item.id} className="py-1 relative group">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={`w-full flex justify-center items-center p-2 hover:bg-accent rounded-[5px] transition-colors
                            ${selectedItem === item.id ? 'bg-accent' : ''}`}
                          title={item.label}
                        >
                          {item.icon}
                        </button>
                      </DropdownMenuTrigger>

                      {/* Tooltip for collapsed view */}
                      <div className="absolute left-full ml-2 -mt-8 z-10 bg-card backdrop-blur-md text-card-foreground text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
                        <p className="font-medium">{item.label}</p>
                        <div className="absolute w-2 h-2 bg-card rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
                      </div>

                      <DropdownMenuContent
                        side="right"
                        align="start"
                        className="mt-0 ml-4 z-50 bg-card backdrop-blur-md shadow-lg rounded-md border border-border w-48 overflow-hidden"
                      >
                        <div className="p-2 text-sm font-medium text-foreground font-[Anton] uppercase border-b border-border">
                          {item.label}
                        </div>
                        <div className="py-1">
                          {item.children?.map((child) => (
                            <DropdownMenuItem
                              key={child.id}
                              className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent ${selectedItem === child.id ? 'bg-accent/50' : ''
                                }`}
                              onClick={() => onItemClick(child.id)}
                            >
                              <span className="text-sm font-medium text-foreground">{child.label}</span>
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              } else {
                // Items without children - simple button
                return (
                  <div key={item.id} className="py-1 relative group">
                    <button
                      className={`w-full flex justify-center items-center p-2 hover:bg-accent rounded-[5px] transition-colors
                        ${selectedItem === item.id ? 'bg-accent' : ''}`}
                      onClick={() => onItemClick(item.id)}
                      title={item.label}
                    >
                      {item.icon}
                    </button>

                    {/* Tooltip */}
                    <div className="absolute left-full ml-2 -mt-8 z-10 bg-card backdrop-blur-md text-card-foreground text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
                      <p className="font-medium">{item.label}</p>
                      <div className="absolute w-2 h-2 bg-card rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
    </div>
  );
};


export default ExploreSidebar;


