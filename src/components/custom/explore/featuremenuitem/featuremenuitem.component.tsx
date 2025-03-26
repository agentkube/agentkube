// FeatureMenuItem.tsx
import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { FeatureItem } from '@/types/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FeatureMenuItemProps {
  feature: FeatureItem;
  isCollapsed: boolean;
  expandedFeatures: string[];
  selectedFeaturePath: string;
  onFeatureClick: (feature: FeatureItem) => void;
  onExpandToggle: (featureId: string) => void;
}

const FeatureMenuItem: React.FC<FeatureMenuItemProps> = ({ 
  feature, 
  isCollapsed, 
  expandedFeatures, 
  selectedFeaturePath, 
  onFeatureClick, 
  onExpandToggle 
}) => {
  const hasChildren = feature.children && feature.children.length > 0;
  const isExpanded = expandedFeatures.includes(feature.id);
  const isSelected = feature.path === selectedFeaturePath;
  const childSelected = feature.children?.some(child => child.path === selectedFeaturePath);
  
  // Local state to control dropdown open state
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleClick = () => {
    if (hasChildren) {
      onExpandToggle(feature.id);
    } else {
      onFeatureClick(feature);
    }
  };

  // When sidebar is collapsed, show icon with flyout menu for children
  if (isCollapsed) {
    // For items with children, use Shadcn dropdown
    if (hasChildren) {
      return (
        <div className="py-1 relative group">
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={`w-full flex justify-center items-center p-2 hover:bg-gray-400/20 rounded-[5px] transition-colors
                  ${isSelected || childSelected ? 'bg-gray-400/30' : ''}`}
                title={feature.label}
              >
                {feature.icon}
              </button>
            </DropdownMenuTrigger>
            
            {/* Tooltip for collapsed view */}
            <div className="absolute left-full ml-2 -mt-8 z-10 bg-gray-200 dark:bg-[#0B0D13]/20 backdrop-blur-md dark:text-white text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
              <p className="font-medium">{feature.label}</p>
              <div className="absolute w-2 h-2 bg-gray-200 dark:bg-gray-900 rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
            </div>
            
            <DropdownMenuContent
              side="right"
              align="start"
              className="mt-0 ml-2 z-50 bg-white dark:bg-[#0B0D13]/20 backdrop-blur-md shadow-lg rounded-md border border-gray-200 dark:border-gray-800 w-48 overflow-hidden"
              onInteractOutside={() => setDropdownOpen(false)}
            >
              <div className="p-2 text-md font-medium text-gray-800 dark:text-gray-300 font-[Anton] uppercase border-b border-gray-200 dark:border-gray-800">
                {feature.label}
              </div>
              <div className="py-1">
                {feature.children?.map((child) => (
                  <DropdownMenuItem
                    key={child.id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      child.path === selectedFeaturePath ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    onClick={() => {
                      onFeatureClick(child);
                      setDropdownOpen(false);
                    }}
                  >
                    {child.icon}
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-300">{child.label}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    }
    
    // For items without children
    return (
      <div className="py-1 relative group">
        <button
          className={`w-full flex justify-center items-center p-2 hover:bg-gray-400/20 rounded-[5px] transition-colors
            ${isSelected ? 'bg-gray-400/20 dark:bg-gray-800/50' : ''}`}
          onClick={handleClick}
          title={feature.label}
        >
          {feature.icon}
        </button>
        
        {/* Tooltip for collapsed view */}
        <div className="absolute left-full ml-2 -mt-8 z-10 bg-gray-200 dark:bg-gray-900 dark:text-white text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
          <p className="font-medium">{feature.label}</p>
          <div className="absolute w-2 h-2 bg-gray-200 dark:bg-gray-900 rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
        </div>
      </div>
    );
  }

  // Expanded sidebar view
  return (
    <div className='px-2'>
      <button
        className={`w-full flex items-center gap-2 hover:bg-gray-300/20 rounded-[0.3rem] py-2
          ${feature.label === "Runbooks" || feature.label === "Investigations" ? 'text-gray-600' : ''}
          ${isSelected || childSelected ? 'bg-gray-400/20 dark:bg-gray-800/50' : ''}`}
        onClick={handleClick}
        disabled={ feature.label === "Runbooks" || feature.label === "Investigations" ? true : false}
      >
        {hasChildren && (
          <span className="mr-1">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </span>
        )}
        {!hasChildren && <span className="w-4 mr-1" />}
        {feature.icon}
        <span 
          className={`text-sm font-medium text-gray-800 dark:text-gray-300 
          ${feature.label === "Runbooks" || feature.label === "Investigations" ? 'text-gray-600 dark:text-gray-600' : ''}`}>
          {feature.label} {feature.label === "Runbooks" || feature.label === "Investigations" ? 
          <span className="text-gray-600 dark:text-gray-600 text-xs border border-gray-600 dark:border-gray-600 rounded-[0.2rem] px-1 py-0.5">coming soon</span> : ''}
        </span>
      </button>
      
      {/* Render children if expanded */}
      {hasChildren && isExpanded && (
        <div className="ml-4 mt-1 space-y-1">
          {feature.children?.map((child) => (
            <button
              key={child.id}
              className={`w-full flex items-center gap-2 hover:bg-gray-300/20 rounded-[0.3rem] py-1 px-4
                ${child.path === selectedFeaturePath ? 'bg-gray-400/20 dark:bg-gray-800/50' : ''}`}
              onClick={() => onFeatureClick(child)}
            >
              {child.icon}
              <span className="text-sm font-medium text-gray-800 dark:text-gray-300">{child.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureMenuItem;