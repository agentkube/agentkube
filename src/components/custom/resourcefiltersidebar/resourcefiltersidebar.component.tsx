import React from 'react';
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { Settings, RotateCcw, Table } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  canToggle?: boolean; // Some columns might be required and non-toggleable
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
  const handleColumnChange = (columnKey: string, checked: boolean) => {
    onColumnToggle(columnKey, checked);
  };

  const handleResetToDefault = () => {
    if (onResetToDefault) {
      onResetToDefault();
    }
  };

  const visibleColumnsCount = columns?.filter(col => col.visible).length || 0;
  const totalColumnsCount = columns?.length || 0;

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
              {columns?.map((column) => (
                <div
                  key={column.key}
                  className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30"
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
              )) || <div className="text-sm text-gray-500 dark:text-gray-400">No columns available</div>}
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