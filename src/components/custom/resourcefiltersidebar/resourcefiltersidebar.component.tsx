import React, { useState } from 'react';
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { Settings, RotateCcw, Table, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  canToggle?: boolean; // Some columns might be required and non-toggleable
  children?: ColumnConfig[]; // For hierarchical columns
  isExpandable?: boolean; // Whether this group can be expanded/collapsed
}

interface ResourceFilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: ColumnConfig[];
  onColumnToggle: (columnKey: string, visible: boolean) => void;
  onResetToDefault?: () => void;
  className?: string;
}

const ResourceFilterSidebar: React.FC<ResourceFilterSidebarProps> = ({
  isOpen,
  onClose,
  title,
  columns,
  onColumnToggle,
  onResetToDefault,
  className = "w-1/3"
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['resources']));

  const handleColumnChange = (columnKey: string, checked: boolean) => {
    onColumnToggle(columnKey, checked);
  };

  const handleResetToDefault = () => {
    if (onResetToDefault) {
      onResetToDefault();
    }
  };

  const toggleGroupExpansion = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const countColumns = (cols: ColumnConfig[]): { visible: number; total: number } => {
    let visible = 0;
    let total = 0;
    
    cols.forEach(col => {
      if (col.children) {
        const childCounts = countColumns(col.children);
        visible += childCounts.visible;
        total += childCounts.total;
      } else {
        total += 1;
        if (col.visible) visible += 1;
      }
    });
    
    return { visible, total };
  };

  const { visible: visibleColumnsCount, total: totalColumnsCount } = countColumns(columns || []);

  const renderColumn = (column: ColumnConfig, depth: number = 0) => {
    const isExpanded = expandedGroups.has(column.key);
    const indentClass = depth > 0 ? `ml-${depth * 4}` : '';
    
    if (column.children) {
      // Check if all children are checked
      const allChildrenChecked = column.children.every(child => child.visible);
      const someChildrenChecked = column.children.some(child => child.visible);
      const isIndeterminate = someChildrenChecked && !allChildrenChecked;
      
      // Render group/parent column
      return (
        <div key={column.key} className={`space-y-2`}>
          <div
            className={`flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 ${indentClass}`}
          >
            <Checkbox
              id={column.key}
              checked={allChildrenChecked}
              onCheckedChange={(checked) => {
                // Toggle all children when parent is clicked
                column.children?.forEach(child => {
                  handleColumnChange(child.key, checked === true);
                });
              }}
              disabled={column.canToggle === false}
              className={`flex-shrink-0 ${isIndeterminate ? 'data-[state=checked]:bg-blue-500' : ''}`}
              data-indeterminate={isIndeterminate}
            />
            
            <div className="flex items-center justify-between flex-grow">
              <label
                htmlFor={column.key}
                className={`text-sm font-medium cursor-pointer ${
                  column.canToggle === false 
                    ? 'text-gray-400 dark:text-gray-600' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {column.label}
              </label>
              
              <div 
                className="cursor-pointer p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                onClick={() => toggleGroupExpansion(column.key)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-500" />
                )}
              </div>
            </div>

            {column.canToggle === false && (
              <span className="text-xs text-gray-400 dark:text-gray-600">
                Required
              </span>
            )}
          </div>
          
          {isExpanded && (
            <div className="space-y-1 ml-4 border-l">
              {column.children.map(child => renderColumn(child, depth + 1))}
            </div>
          )}
        </div>
      );
    } else {
      // Render leaf/child column
      return (
        <div
          key={column.key}
          className={`flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30 ${indentClass}`}
        >
          <Checkbox
            id={column.key}
            checked={column.visible}
            onCheckedChange={(checked) => 
              handleColumnChange(column.key, checked === true)
            }
            disabled={column.canToggle === false}
            className="flex-shrink-0"
          />
          
          <label
            htmlFor={column.key}
            className={`text-sm cursor-pointer flex-grow ${
              column.canToggle === false 
                ? 'text-gray-400 dark:text-gray-600' 
                : 'text-gray-700 dark:text-gray-300'
            }`}
          >
            {column.label}
          </label>

          {column.canToggle === false && (
            <span className="text-xs text-gray-400 dark:text-gray-600">
              Required
            </span>
          )}
        </div>
      );
    }
  };

  return (
    <SideDrawer
      isOpen={isOpen}
      onClose={onClose}
      className={className}
      offsetTop='-top-6'
    >
      <DrawerHeader onClose={onClose}>
        <div className="flex items-center gap-2">
        <div className='bg-gray-200/20 dark:bg-gray-500/20 rounded-md p-1.5'>
            <Table className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium">Table Management</span>
        </div>
      </DrawerHeader>

      <DrawerContent className="p-4">
        <div className="space-y-6">
          {/* Header with reset button */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {visibleColumnsCount} of {totalColumnsCount} columns visible
              </p>
            </div>
            
            {onResetToDefault && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToDefault}
                className="flex items-center gap-2"
              >
                <RotateCcw className="h-3 w-3" />
                Restore default
              </Button>
            )}
          </div>

          {/* Column toggles */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Columns
            </h4>
            
            <div className="space-y-2">
              {columns?.map((column) => renderColumn(column)) || 
                <div className="text-sm text-gray-500 dark:text-gray-400">No columns available</div>}
            </div>
          </div>

          {/* Info section */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>" Use checkboxes to show/hide table columns</p>
              <p>" Some columns are required and cannot be hidden</p>
              <p>" Changes are applied immediately</p>
            </div>
          </div>
        </div>
      </DrawerContent>
    </SideDrawer>
  );
};

export default ResourceFilterSidebar;
export { type ColumnConfig };