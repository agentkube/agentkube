import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, AlertTriangle, XCircle, Info, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { PopeyeSection } from "@/types/cluster-report";

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'resource' | 'type' | 'severity' | 'message' | 'group' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

interface IssuesSectionProps {
  filteredSections: PopeyeSection[];
  navigateToResource: (resourceName: string, gvr: string, namespace?: string) => void;
}

const IssuesSection: React.FC<IssuesSectionProps> = ({ filteredSections, navigateToResource }) => {
  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

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

  return (
    <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
      <div className="rounded-md border">
        <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
          <TableHeader>
            <TableRow className="border-b border-gray-300 dark:border-gray-800/80">
              <TableHead
                className="cursor-pointer hover:text-blue-500"
                onClick={() => handleSort('resource')}
              >
                Resource {renderSortIndicator('resource')}
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-blue-500"
                onClick={() => handleSort('type')}
              >
                Type {renderSortIndicator('type')}
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-blue-500"
                onClick={() => handleSort('severity')}
              >
                Severity {renderSortIndicator('severity')}
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-blue-500"
                onClick={() => handleSort('message')}
              >
                Message {renderSortIndicator('message')}
              </TableHead>
              <TableHead
                className="cursor-pointer hover:text-blue-500"
                onClick={() => handleSort('group')}
              >
                Group {renderSortIndicator('group')}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedIssues.map((issue) => (
              <TableRow
                key={issue.key}
                className="bg-gray-50 dark:bg-transparent border-b border-gray-200 dark:border-gray-800/80"
              >
                <TableCell className="font-medium ">
                  <div 
                    className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                    onClick={() => navigateToResource(issue.resource, issue.gvr)}
                  >
                    {issue.resource}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="capitalize">{issue.type.replace(/([A-Z])/g, ' $1').trim()}</div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {getSeverityIcon(issue.severity)}
                    {getSeverityBadge(issue.severity)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="max-w-sm text-sm dark:text-gray-400 truncate">{issue.message}</div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {issue.group === '__root__' ? 'Root' : issue.group}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
};

export default IssuesSection;