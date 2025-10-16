import React, { useState, useEffect } from 'react';
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { Settings, RotateCcw, Table, ChevronDown, ChevronRight, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { saveColumnConfig } from '@/utils/columnConfigStorage';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  canToggle?: boolean; // Some columns might be required and non-toggleable
  children?: ColumnConfig[]; // For hierarchical columns
  isExpandable?: boolean; // Whether this group can be expanded/collapsed
}

interface SortableColumnItemProps {
  column: ColumnConfig;
  onColumnChange: (columnKey: string, checked: boolean) => void;
  expandedGroups: Set<string>;
  onToggleExpansion: (groupKey: string) => void;
}

interface ResourceFilterSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: ColumnConfig[];
  onColumnToggle: (columnKey: string, visible: boolean) => void;
  onColumnReorder?: (reorderedColumns: ColumnConfig[]) => void;
  onResetToDefault?: () => void;
  className?: string;
  resourceType?: string; // For localStorage caching
}

// Sortable Column Item Component
const SortableColumnItem: React.FC<SortableColumnItemProps> = ({
  column,
  onColumnChange,
  expandedGroups,
  onToggleExpansion,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isExpanded = expandedGroups.has(column.key);

  if (column.children) {
    // Check if all children are checked
    const allChildrenChecked = column.children.every(child => child.visible);
    const someChildrenChecked = column.children.some(child => child.visible);
    const isIndeterminate = someChildrenChecked && !allChildrenChecked;

    // Render group/parent column
    return (
      <div ref={setNodeRef} style={style} className="space-y-2">
        <div className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 dark:hover:bg-transparent rounded"
          >
            <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-500" />
          </div>

          <Checkbox
            id={column.key}
            checked={allChildrenChecked}
            onCheckedChange={(checked) => {
              // Toggle all children when parent is clicked
              column.children?.forEach(child => {
                onColumnChange(child.key, checked === true);
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
              onClick={() => onToggleExpansion(column.key)}
            >
              {isExpanded ? (
                <ChevronRight className="h-4 w-4 text-gray-500 transform rotate-90" />
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
          <div className="space-y-1 ml-4 border-l pl-2">
            {column.children.map(child => (
              <div
                key={child.key}
                className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30"
              >
                <Checkbox
                  id={child.key}
                  checked={child.visible}
                  onCheckedChange={(checked) =>
                    onColumnChange(child.key, checked === true)
                  }
                  disabled={child.canToggle === false}
                  className="flex-shrink-0"
                />

                <label
                  htmlFor={child.key}
                  className={`text-sm cursor-pointer flex-grow ${
                    child.canToggle === false
                      ? 'text-gray-400 dark:text-gray-600'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {child.label}
                </label>

                {child.canToggle === false && (
                  <span className="text-xs text-gray-400 dark:text-gray-600">
                    Required
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  } else {
    // Render leaf/child column
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center space-x-2 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/30"
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 dark:hover:bg-transparent rounded"
        >
          <GripVertical className="h-4 w-4 text-gray-400 dark:text-gray-500" />
        </div>

        <Checkbox
          id={column.key}
          checked={column.visible}
          onCheckedChange={(checked) =>
            onColumnChange(column.key, checked === true)
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

const ResourceFilterSidebar: React.FC<ResourceFilterSidebarProps> = ({
  isOpen,
  onClose,
  title,
  columns,
  onColumnToggle,
  onColumnReorder,
  onResetToDefault,
  className = "w-1/3",
  resourceType
}) => {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['resources']));

  const handleColumnChange = (columnKey: string, checked: boolean) => {
    onColumnToggle(columnKey, checked);
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required to start dragging
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id && onColumnReorder) {
      const oldIndex = columns.findIndex((col) => col.key === active.id);
      const newIndex = columns.findIndex((col) => col.key === over.id);

      const reorderedColumns = arrayMove(columns, oldIndex, newIndex);
      onColumnReorder(reorderedColumns);
    }
  };

  // Save to localStorage when columns change
  useEffect(() => {
    if (resourceType && columns.length > 0) {
      saveColumnConfig(resourceType, columns);
    }
  }, [columns, resourceType]);

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

          {/* Column toggles with drag and drop */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Columns
            </h4>

            <div className="space-y-2">
              {onColumnReorder ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={columns.map(col => col.key)}
                    strategy={verticalListSortingStrategy}
                  >
                    {columns?.map((column) => (
                      <SortableColumnItem
                        key={column.key}
                        column={column}
                        onColumnChange={handleColumnChange}
                        expandedGroups={expandedGroups}
                        onToggleExpansion={toggleGroupExpansion}
                      />
                    )) || (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        No columns available
                      </div>
                    )}
                  </SortableContext>
                </DndContext>
              ) : (
                columns?.map((column) => (
                  <SortableColumnItem
                    key={column.key}
                    column={column}
                    onColumnChange={handleColumnChange}
                    expandedGroups={expandedGroups}
                    onToggleExpansion={toggleGroupExpansion}
                  />
                )) || (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    No columns available
                  </div>
                )
              )}
            </div>
          </div>

          {/* Info section */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>" Use checkboxes to show/hide table columns</p>
              {onColumnReorder && <p>" Drag the grip icon to reorder columns</p>}
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
