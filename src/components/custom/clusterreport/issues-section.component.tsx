import React, { useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertTriangle, XCircle, Info, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown, Filter } from "lucide-react";
import { PopeyeSection } from "@/types/cluster-report";
import ResourceFilterSidebar from '@/components/custom/resourcefiltersidebar/resourcefiltersidebar.component';
import { ColumnConfig } from '@/types/resource-filter';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'resource' | 'type' | 'severity' | 'message' | 'group' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

// Export a method to open filter from parent
export interface IssuesSectionRef {
  openFilter: () => void;
}

interface IssuesSectionProps {
  filteredSections: PopeyeSection[];
  navigateToResource: (resourceName: string, gvr: string, namespace?: string) => void;
}

const IssuesSection = forwardRef<IssuesSectionRef, IssuesSectionProps>(function IssuesSection({ filteredSections, navigateToResource }, ref) {
  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Default column configuration
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'resource', label: 'Resource', visible: true, canToggle: false }, // Required column
    { key: 'type', label: 'Type', visible: true, canToggle: true },
    { key: 'severity', label: 'Severity', visible: true, canToggle: true },
    { key: 'message', label: 'Message', visible: true, canToggle: true },
    { key: 'group', label: 'Group', visible: true, canToggle: true }
  ];

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('cluster-report-issues', defaultColumnConfig)
  );
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col =>
        col.key === columnKey ? { ...col, visible } : col
      );
      saveColumnConfig('cluster-report-issues', updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    saveColumnConfig('cluster-report-issues', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('cluster-report-issues');
  };

  const isColumnVisible = (columnKey: string) => {
    const column = columnConfig.find(col => col.key === columnKey);
    return column ? column.visible : true;
  };

  // Expose method to parent component
  useImperativeHandle(ref, () => ({
    openFilter: () => setIsFilterSidebarOpen(true)
  }));

  const getSeverityIcon = (level: number) => {
    switch (level) {
      case 0: return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 1: return <Info className="w-4 h-4 text-blue-600" />;
      case 2: return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 3: return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const getSeverityBadge = (level: number) => {
    const config = {
      0: { label: 'OK', class: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300' },
      1: { label: 'INFO', class: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300' },
      2: { label: 'WARNING', class: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300' },
      3: { label: 'ERROR', class: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300' }
    };

    const { label, class: className } = config[level as keyof typeof config] || config[1];
    return (
      <Badge className={`${className} text-xs font-medium`}>
        {label}
      </Badge>
    );
  };

  // Handle column sort click
  const handleSort = (field: SortField) => {
    setSort(prevSort => {
      // If clicking the same field
      if (prevSort.field === field) {
        // Toggle direction: asc -> desc -> null -> asc
        if (prevSort.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prevSort.direction === 'desc') {
          return { field: null, direction: null };
        } else {
          return { field, direction: 'asc' };
        }
      }
      // If clicking a new field, default to ascending
      return { field, direction: 'asc' };
    });
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sort.field !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-10" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  // Flatten and sort issues
  const sortedIssues = useMemo(() => {
    // First, flatten all issues into a single array
    const allIssues = filteredSections.flatMap((section) =>
      Object.entries(section.issues || {}).flatMap(([resource, issues]) =>
        issues.map((issue, issueIndex) => ({
          key: `${section.linter}-${resource}-${issueIndex}`,
          resource,
          type: section.linter,
          gvr: section.gvr,
          severity: issue.level,
          message: issue.message,
          group: issue.group
        }))
      )
    );

    // If no sorting is applied, return the original order
    if (!sort.field || !sort.direction) {
      return allIssues;
    }

    // Sort the flattened issues
    return [...allIssues].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'resource':
          return a.resource.localeCompare(b.resource) * sortMultiplier;

        case 'type':
          return a.type.localeCompare(b.type) * sortMultiplier;

        case 'severity': {
          // Sort by severity level (0=OK, 1=INFO, 2=WARNING, 3=ERROR)
          return (a.severity - b.severity) * sortMultiplier;
        }

        case 'message':
          return a.message.localeCompare(b.message) * sortMultiplier;

        case 'group': {
          const groupA = a.group === '__root__' ? 'Root' : a.group;
          const groupB = b.group === '__root__' ? 'Root' : b.group;
          return groupA.localeCompare(groupB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredSections, sort.field, sort.direction]);

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible) {
      return null;
    }

    const sortFieldMap: Record<string, SortField> = {
      resource: 'resource',
      type: 'type',
      severity: 'severity',
      message: 'message',
      group: 'group'
    };

    const sortField = sortFieldMap[column.key];

    return (
      <TableHead
        key={column.key}
        className="cursor-pointer hover:text-blue-500"
        onClick={() => sortField && handleSort(sortField)}
      >
        {column.label} {sortField && renderSortIndicator(sortField)}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (issue: any, column: ColumnConfig) => {
    if (!column.visible) {
      return null;
    }

    switch (column.key) {
      case 'resource':
        return (
          <TableCell key={column.key} className="font-medium">
            <div
              className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
              onClick={() => navigateToResource(issue.resource, issue.gvr)}
            >
              {issue.resource}
            </div>
          </TableCell>
        );

      case 'type':
        return (
          <TableCell key={column.key}>
            <div className="capitalize">{issue.type.replace(/([A-Z])/g, ' $1').trim()}</div>
          </TableCell>
        );

      case 'severity':
        return (
          <TableCell key={column.key}>
            <div className="flex items-center gap-2">
              {getSeverityIcon(issue.severity)}
              {getSeverityBadge(issue.severity)}
            </div>
          </TableCell>
        );

      case 'message':
        return (
          <TableCell key={column.key}>
            <div className="max-w-sm text-sm dark:text-gray-400 truncate">{issue.message}</div>
          </TableCell>
        );

      case 'group':
        return (
          <TableCell key={column.key}>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {issue.group === '__root__' ? 'Root' : issue.group}
            </span>
          </TableCell>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <div className="rounded-md border">
          <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
            <TableHeader>
              <TableRow className="border-b border-gray-300 dark:border-gray-800/80">
                {columnConfig.map(col => renderTableHeader(col))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedIssues.map((issue) => (
                <TableRow
                  key={issue.key}
                  className="bg-gray-50 dark:bg-transparent border-b border-gray-200 dark:border-gray-800/80"
                >
                  {columnConfig.map(col => renderTableCell(issue, col))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Column Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={isFilterSidebarOpen}
        onClose={() => setIsFilterSidebarOpen(false)}
        title="Issues Columns"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="cluster-report-issues"
      />
    </>
  );
});

IssuesSection.displayName = 'IssuesSection';

export default IssuesSection;
