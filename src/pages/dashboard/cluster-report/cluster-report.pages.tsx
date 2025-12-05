import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { getClusterReport, } from '@/api/cluster';
import { ClusterReport as ClusterReportType } from '@/types/cluster-report'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, AlertTriangle, XCircle, Info, AlertCircle, TrendingUp, Award, Search, Eye, MoreVertical, RotateCcw, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useNavigate } from 'react-router-dom';
import IssuesSection, { type IssuesSectionRef } from '@/components/custom/clusterreport/issues-section.component';
import ResourceFilterSidebar from '@/components/custom/resourcefiltersidebar/resourcefiltersidebar.component';
import { ColumnConfig } from '@/types/resource-filter';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';

interface StatCardProps {
  count: number;
  label: string;
  timeframe: string;
  icon: React.ReactNode;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ count, label, timeframe, icon, color }) => (
  <Card className="bg-transparent hover:dark:bg-gray-800/20 border border-gray-300/20 dark:border-gray-700/50 rounded-md">
    <CardContent className="p-3">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 rounded-lg ${color}`}>
          {icon}
        </div>
        <h2 className="text-4xl font-light text-gray-900 dark:text-gray-200">
          {count}
        </h2>
      </div>
      <h3 className="text-xs font-medium text-gray-900 dark:text-gray-100">
        {label}
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {timeframe}
      </p>
    </CardContent>
  </Card>
);

const ClusterReport: React.FC = () => {
  const { currentContext } = useCluster();
  const [report, setReport] = useState<ClusterReportType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('overview');
  const navigate = useNavigate();

  // Default column configuration for Overview table
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'resource', label: 'Resource Type', visible: true, canToggle: false },
    { key: 'score', label: 'Score', visible: true, canToggle: true },
    { key: 'ok', label: 'OK', visible: true, canToggle: true },
    { key: 'info', label: 'Info', visible: true, canToggle: true },
    { key: 'warnings', label: 'Warnings', visible: true, canToggle: true },
    { key: 'errors', label: 'Errors', visible: true, canToggle: true },
    { key: 'issues', label: 'Issues', visible: true, canToggle: true },
    { key: 'actions', label: 'Actions', visible: true, canToggle: false }
  ];

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('cluster-report', defaultColumnConfig)
  );

  // Ref for IssuesSection to access its filter state and functions
  const issuesSectionRef = useRef<IssuesSectionRef>(null);

  // Column management functions for Overview table
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col =>
        col.key === columnKey ? { ...col, visible } : col
      );
      saveColumnConfig('cluster-report', updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    saveColumnConfig('cluster-report', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    clearColumnConfig('cluster-report');
  };

  // Function to handle filter button click based on active tab
  const handleFilterClick = () => {
    if (selectedTab === 'overview') {
      // Open overview filter sidebar (we'll add this state next)
      setIsOverviewFilterOpen(true);
    } else if (selectedTab === 'issues') {
      // Open issues filter sidebar through ref
      issuesSectionRef.current?.openFilter();
    }
  };

  const [isOverviewFilterOpen, setIsOverviewFilterOpen] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const reportData = await getClusterReport(currentContext.name);
        setReport(reportData);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch cluster report:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch cluster report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [currentContext]);

  const getGradeColor = (grade: string): string => {
    switch (grade) {
      case 'A': return 'text-green-600 dark:text-green-400';
      case 'B': return 'text-blue-600 dark:text-blue-400';
      case 'C': return 'text-yellow-600 dark:text-yellow-400';
      case 'D': return 'text-orange-600 dark:text-orange-400';
      case 'F': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600 dark:text-green-400';
    if (score >= 75) return 'text-blue-600 dark:text-blue-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

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

  const filteredSections = useMemo(() => {
    if (!report?.popeye.sections) return [];

    if (!searchQuery.trim()) {
      return report.popeye.sections;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return report.popeye.sections.filter(section => {
      const linterName = section.linter.toLowerCase();
      const gvr = section.gvr.toLowerCase();

      // Check if linter name or GVR contains the query
      if (linterName.includes(lowercaseQuery) || gvr.includes(lowercaseQuery)) {
        return true;
      }

      // Check if any issue matches the query
      const hasMatchingIssue = Object.entries(section.issues || {}).some(([resource, issues]) => {
        const resourceName = resource.toLowerCase();
        if (resourceName.includes(lowercaseQuery)) return true;

        return issues.some(issue =>
          issue.message.toLowerCase().includes(lowercaseQuery) ||
          issue.group.toLowerCase().includes(lowercaseQuery)
        );
      });

      return hasMatchingIssue;
    });
  }, [report?.popeye.sections, searchQuery]);

  const totalStats = useMemo(() => {
    if (!report?.popeye.sections) return { ok: 0, info: 0, warning: 0, error: 0 };

    return report.popeye.sections.reduce((acc, section) => ({
      ok: acc.ok + (section.tally?.ok || 0),
      info: acc.info + (section.tally?.info || 0),
      warning: acc.warning + (section.tally?.warning || 0),
      error: acc.error + (section.tally?.error || 0)
    }), { ok: 0, info: 0, warning: 0, error: 0 });
  }, [report?.popeye.sections]);

  const handleRefresh = () => {
    if (currentContext) {
      setLoading(true);
      getClusterReport(currentContext.name)
        .then(setReport)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false));
    }
  };

  const navigateToResource = (resourceName: string, gvr: string, namespace?: string) => {

    const resourceType = gvr.split('/').pop();

    const parts = resourceName.split('/');
    const actualResourceName = parts.length > 1 ? parts[1] : parts[0];
    const resourceNamespace = namespace || (parts.length > 1 ? parts[0] : 'default');

    navigate(`/dashboard/explore/${resourceType}/${resourceNamespace}/${actualResourceName}`);
  };

  // Helper function to render table header based on column key
  const renderTableHeader = (column: ColumnConfig) => {
    if (!column.visible) {
      return null;
    }

    const isNumericColumn = ['score', 'ok', 'info', 'warnings', 'errors', 'issues'].includes(column.key);

    return (
      <TableHead
        key={column.key}
        className={isNumericColumn ? 'text-center' : ''}
      >
        {column.label}
      </TableHead>
    );
  };

  // Helper function to render table cell based on column key
  const renderTableCell = (section: any, column: ColumnConfig) => {
    if (!column.visible) {
      return null;
    }

    switch (column.key) {
      case 'resource':
        return (
          <TableCell key={column.key} className="font-medium">
            <div>
              <div className="font-medium capitalize">{section.linter.replace(/([A-Z])/g, ' $1').trim()}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{section.gvr}</div>
            </div>
          </TableCell>
        );

      case 'score':
        return (
          <TableCell key={column.key} className="text-center">
            <div className={`font-bold ${getScoreColor(section.tally?.score || 0)}`}>
              {section.tally?.score || 0}
            </div>
          </TableCell>
        );

      case 'ok':
        return (
          <TableCell key={column.key} className="text-center">
            <span className="text-green-600 dark:text-green-400 font-medium">
              {section.tally?.ok || 0}
            </span>
          </TableCell>
        );

      case 'info':
        return (
          <TableCell key={column.key} className="text-center">
            <span className="text-blue-600 dark:text-blue-400 font-medium">
              {section.tally?.info || 0}
            </span>
          </TableCell>
        );

      case 'warnings':
        return (
          <TableCell key={column.key} className="text-center">
            <span className="text-yellow-600 dark:text-yellow-400 font-medium">
              {section.tally?.warning || 0}
            </span>
          </TableCell>
        );

      case 'errors':
        return (
          <TableCell key={column.key} className="text-center">
            <span className="text-red-600 dark:text-red-400 font-medium">
              {section.tally?.error || 0}
            </span>
          </TableCell>
        );

      case 'issues':
        return (
          <TableCell key={column.key} className="text-center">
            <span className="font-medium">
              {Object.keys(section.issues || {}).length}
            </span>
          </TableCell>
        );

      case 'actions':
        return (
          <TableCell key={column.key}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSelectedTab('details')}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        );

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="m-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!report) {
    return (
      <Alert className="m-6">
        <AlertDescription>No cluster report available</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="
      max-h-[93vh] overflow-y-auto
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

      <div className="p-6 space-y-1.5">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50">
              Cluster Report
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Security and best practices analysis for <span className="font-medium text-blue-600 dark:text-blue-400">{currentContext?.name}</span>
            </p>
          </div>
          <Button onClick={handleRefresh} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <RotateCcw />
            Refresh Report
          </Button>
        </div>

        {/* Score Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <Card className="rounded-md bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-gray-900/20 border border-gray-300/20 dark:border-gray-700/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-blue-600" />
                Overall Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className='flex items-baseline gap-1'>
                  <div className={`text-6xl font-light ${getScoreColor(report.popeye.score)}`}>
                    {report.popeye.score}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">/ 100</div>
                </div>
                <div className={`text-8xl font-bold ${getGradeColor(report.popeye.grade)} opacity-20`}>
                  {report.popeye.grade}
                </div>
              </div>
              <div className="mt-4">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    className={`h-1 rounded-full transition-all duration-300 ${report.popeye.score >= 90 ? 'bg-green-500' :
                      report.popeye.score >= 75 ? 'bg-blue-500' :
                        report.popeye.score >= 60 ? 'bg-yellow-500' :
                          report.popeye.score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${report.popeye.score}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md bg-gray-50 dark:bg-transparent border border-gray-300/20 dark:border-gray-700/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-purple-600" />
                Report Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Generated</span>
                <span className="font-medium">{new Date(report.popeye.report_time).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Cluster</span>
                <span className="font-medium">{report.ClusterName || currentContext?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Sections</span>
                <span className="font-medium">{report.popeye.sections?.length || 0}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
          <StatCard
            count={totalStats.ok}
            label="Healthy Resources"
            timeframe="No issues found"
            icon={<CheckCircle className="w-6 h-6 text-green-600" />}
            color="bg-green-100 dark:bg-green-900/20"
          />
          <StatCard
            count={totalStats.info}
            label="Info Messages"
            timeframe="Informational items"
            icon={<Info className="w-6 h-6 text-blue-600" />}
            color="bg-blue-100 dark:bg-blue-900/20"
          />
          <StatCard
            count={totalStats.warning}
            label="Warnings"
            timeframe="Should be reviewed"
            icon={<AlertTriangle className="w-6 h-6 text-yellow-600" />}
            color="bg-yellow-100 dark:bg-yellow-900/20"
          />
          <StatCard
            count={totalStats.error}
            label="Errors"
            timeframe="Need immediate attention"
            icon={<XCircle className="w-6 h-6 text-red-600" />}
            color="bg-red-100 dark:bg-red-900/20"
          />
        </div>

        {/* Main Content */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <div className="flex justify-between items-center">
            <TabsList className='text-sm dark:bg-transparent'>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="issues">Issues</TabsTrigger>
            </TabsList>

            <div className="w-full max-w-md flex items-center gap-2">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search sections, resources, or issues..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFilterClick}
                className="flex items-center gap-2 h-9 dark:text-gray-300/80"
                title="Filter columns"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
              <div className="rounded-md">
                <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
                  <TableHeader>
                    <TableRow className="border-b border-gray-200 dark:border-gray-800/80">
                      {columnConfig.map(col => renderTableHeader(col))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSections.map((section, index) => (
                      <TableRow
                        key={index}
                        className="bg-gray-50 dark:bg-transparent border-b border-gray-200 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                      >
                        {columnConfig.map(col => renderTableCell(section, col))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="space-y-6">
            {filteredSections.map((section, sectionIndex) => (
              <Card key={sectionIndex} className="bg-gray-50 dark:bg-transparent border-gray-200 dark:border-gray-800/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="capitalize font-light text-2xl">{section.linter.replace(/([A-Z])/g, ' $1').trim()}</span>

                    </div>
                    <div className='flex items-center gap-4'>

                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-green-600 border-green-200">
                          {section.tally?.ok || 0} OK
                        </Badge>
                        <Badge variant="outline" className="text-blue-600 border-blue-200">
                          {section.tally?.info || 0} Info
                        </Badge>
                        <Badge variant="outline" className="text-yellow-600 border-yellow-200">
                          {section.tally?.warning || 0} Warning
                        </Badge>
                        <Badge variant="outline" className="text-rose-500 border-rose-200">
                          {section.tally?.error || 0} Error
                        </Badge>
                      </div>
                      <div className='flex items-baseline'>
                        <div className={`font-light text-3xl ${getScoreColor(section.tally?.score || 0)}`}>
                          {section.tally?.score || 0}
                        </div>
                        <span className='text-xs font-light text-gray-400 dark:text-gray-500'>/ 100</span>
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                {Object.keys(section.issues || {}).length > 0 && (
                  <CardContent>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                      GVR: {section.gvr}
                    </div>
                    <div className="space-y-3">
                      {Object.entries(section.issues || {}).map(([resource, issues], resourceIndex) => (
                        <div key={resourceIndex} className="border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                          <div
                            className="font-medium text-sm mb-2 text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
                            onClick={() => navigateToResource(resource, section.gvr)}
                          >
                            {resource}
                          </div>
                          <div className="space-y-2">
                            {issues.map((issue, issueIndex) => (
                              <div key={issueIndex} className="flex items-start gap-2 text-sm">
                                {getSeverityIcon(issue.level)}
                                <div className="flex-1 text-xs">
                                  <div className="text-gray-900 dark:text-gray-300">{issue.message}</div>
                                  {issue.group !== '__root__' && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      Group: {issue.group}
                                    </div>
                                  )}
                                </div>
                                {getSeverityBadge(issue.level)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="issues" className="space-y-6">
            <IssuesSection
              ref={issuesSectionRef}
              filteredSections={filteredSections}
              navigateToResource={navigateToResource}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Column Filter Sidebar for Overview */}
      <ResourceFilterSidebar
        isOpen={isOverviewFilterOpen}
        onClose={() => setIsOverviewFilterOpen(false)}
        title="Overview Columns"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="cluster-report"
      />
    </div>
  );
};

export default ClusterReport;