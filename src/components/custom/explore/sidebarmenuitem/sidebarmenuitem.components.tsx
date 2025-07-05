// (components/custom/explore/sidebarmenuitem/sidebarmenuitem.components.tsx)
import React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarItem } from '@/types/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SidebarMenuItemProps {
  item: SidebarItem;
  isExpanded: boolean;
  selectedItem: string | null;
  level: number;
  onItemClick: (itemId: string | null) => void;
  onExpandToggle: (itemId: string) => void;
  isCollapsed: boolean;
}

const SidebarMenuItem: React.FC<SidebarMenuItemProps> = ({
  item,
  isExpanded,
  selectedItem,
  level,
  onItemClick,
  onExpandToggle,
  isCollapsed
}) => {
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedItem === item.id;
  const paddingLeft = `${level * 1}rem`;

  const handleClick = () => {
    if (hasChildren) {
      // Only toggle expansion for parent items
      onExpandToggle(item.id);
    } else {
      // Only navigate for leaf items
      onItemClick(item.id);
    }
  };

  // When sidebar is collapsed and it's a top-level item with children
  if (isCollapsed && level === 0 && hasChildren) {
    return (
      <div className="py-1 relative group">
        <DropdownMenu open={isExpanded} onOpenChange={(open) => {
          if (open !== isExpanded) {
            onExpandToggle(item.id);
          }
        }}>
          <DropdownMenuTrigger asChild>
            <button
              className={`w-full flex justify-center items-center p-2 hover:bg-gray-400/20 rounded-[5px] transition-colors
                ${isSelected ? 'bg-gray-400/30' : ''}`}
              title={item.label}
            >
              {item.icon}
            </button>
          </DropdownMenuTrigger>
          
          {/* Tooltip for collapsed view */}
          <div className="absolute left-full ml-2 -mt-8 z-10 bg-gray-200 dark:bg-gray-900 dark:text-white text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
            <p className="font-medium">{item.label}</p>
            <div className="absolute w-2 h-2 bg-gray-200 dark:bg-gray-900 rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
          </div>
          
          <DropdownMenuContent
            side="right"
            align="start"
            className="mt-0 ml-4 z-50 dark:bg-white dark:dark:bg-[#0B0D13]/30 backdrop-blur-md shadow-lg rounded-md border border-gray-200 dark:border-gray-800/60 w-48 overflow-hidden"
          >
            <div className="p-2 text-sm font-medium text-gray-800 dark:text-gray-300 font-[Anton] uppercase border-b border-gray-200 dark:border-gray-800">
              {item.label}
            </div>
            <div className="py-1 ">
              {item.children?.map((child) => (
                <DropdownMenuItem
                  key={child.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 ${
                    selectedItem === child.id ? 'bg-blue-50 dark:bg-blue-900/10' : ''
                  }`}
                  onClick={() => onItemClick(child.id)}
                >
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-300">
                    {child.icon}
                  </span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-300">{child.label}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // When sidebar is collapsed and it's a top-level item without children
  if (isCollapsed && level === 0) {
    return (
      <div className="py-1 relative group">
        <button
          className={`w-full flex justify-center items-center p-2 hover:bg-gray-400/20 rounded-[5px] transition-colors 
            ${isSelected ? 'bg-gray-400/30' : ''}`}
          onClick={handleClick}
          title={item.label}
        >
          {item.icon}
        </button>
        
        {/* Tooltip for collapsed view */}
        <div className="absolute left-full ml-2 -mt-8 z-10 bg-gray-200 dark:bg-gray-900 dark:text-white text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
          <p className="font-medium">{item.label}</p>
          <div className="absolute w-2 h-2 bg-gray-200 dark:bg-gray-900 rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
        </div>
      </div>
    );
  }

  // Expanded sidebar view
  return (
    <div>
      <button
        className={`w-full flex items-center py-1.5 px-4 hover:bg-gray-400/20 dark:hover:bg-gray-600/20 rounded-[5px] transition-colors 
          ${isSelected ? 'bg-gray-400/20  dark:bg-gray-800/50' : ''}`}
        onClick={handleClick}
        style={{ paddingLeft }}
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
        {item.icon}
        <span className="ml-2 text-sm font-medium text-left">{item.label}</span>
      </button>
      {hasChildren && isExpanded && !isCollapsed && (
        <div className="mt-1">
          {item.children?.map((child) => (
            <SidebarMenuItem
              key={child.id}
              item={child}
              isExpanded={false}
              selectedItem={selectedItem}
              level={level + 1}
              onItemClick={onItemClick}
              onExpandToggle={onExpandToggle}
              isCollapsed={isCollapsed}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SidebarMenuItem;