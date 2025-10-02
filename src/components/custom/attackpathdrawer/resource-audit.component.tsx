import React, { useState, useEffect, useMemo } from 'react';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertCircle,
  Loader2,
  Info,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  ArrowUpRight
} from 'lucide-react';
import { TrivyConfigAuditReport, TrivyConfigAuditReportsResponse, TrivyConfigAuditCheck, SeverityLevel } from '@/types/trivy';
import { getTrivyStatus } from '@/api/scanner/security';
import { kubeProxyRequest } from '@/api/cluster';
import { useCluster } from '@/contexts/clusterContext';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';
import MarkdownContent from '@/utils/markdown-formatter';

interface ResourceAuditProps {
  resourceData: K8sResourceData;
}


export const ResourceAudit: React.FC<ResourceAuditProps> = ({ resourceData }) => {
  const [configAuditReports, setConfigAuditReports] = useState<TrivyConfigAuditReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currentContext } = useCluster();
  const [isTrivyInstalled, setIsTrivyInstalled] = useState(false);
  const { addStructuredContent } = useDrawer();

  // Filter and expand states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityLevel | "all">("all");
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    const checkTrivyAndFetch = async () => {
      if (!currentContext?.name) return;

      try {
        setLoading(true);
        const status = await getTrivyStatus(currentContext.name);
        setIsTrivyInstalled(status.installed);

        if (status.installed) {
          await fetchConfigAuditReports();
        }
      } catch (err) {
        console.error('Error checking Trivy status:', err);
        setIsTrivyInstalled(false);
        setError(err instanceof Error ? err.message : 'Failed to check Trivy status');
      } finally {
        setLoading(false);
      }
    };

    checkTrivyAndFetch();
  }, [currentContext?.name]);

  const fetchConfigAuditReports = async () => {
    if (!currentContext?.name) return;

    try {
      setLoading(true);
      const response = await kubeProxyRequest(
        currentContext.name,
        'apis/aquasecurity.github.io/v1alpha1/configauditreports',
        'GET'
      ) as TrivyConfigAuditReportsResponse;

      if (response && response.items && Array.isArray(response.items)) {
        setConfigAuditReports(response.items);
      } else {
        console.error('Unexpected API response format:', response);
        setError('Invalid data format received from API');
      }
    } catch (err) {
      console.error('Failed to fetch config audit reports:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch config audit reports');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-10" />;
    }

    if (sortDirection === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sortDirection === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };



  const toggleCheckExpansion = (checkKey: string) => {
    setExpandedChecks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(checkKey)) {
        newSet.delete(checkKey);
      } else {
        newSet.add(checkKey);
      }
      return newSet;
    });
  };

  const handleResolveClick = (check: TrivyConfigAuditCheck | any, report: TrivyConfigAuditReport) => {
    const resourceName = report.metadata.labels?.['trivy-operator.resource.name'] || report.metadata.name;
    const resourceKind = report.metadata.labels?.['trivy-operator.resource.kind'] || 'resource';
    
    const structuredContent = `**${check.title}** ${check.severity} ${check.success ? 'PASS' : 'FAIL'}

${check.description}

**Check ID:** ${check.checkID || check.id || 'N/A'}
**Category:** ${check.category}

**Messages:**
${check.messages.map((msg: string) => `• ${msg}`).join('\n')}

**Resource:** ${resourceKind}/${resourceName}
**Namespace:** ${report.metadata.labels?.['trivy-operator.resource.namespace'] || report.metadata.namespace || 'N/A'}`;

    addStructuredContent(structuredContent, `${check.title.substring(0, 20)}...`);
    toast({
      title: "Added to chat",
      description: "Security issue added to chat context"
    });
  };

  // Get filtered checks from all reports
  const filteredChecks = useMemo(() => {
    if (!Array.isArray(configAuditReports)) {
      return [];
    }

    // First filter reports by resource
    let filtered = configAuditReports.filter(report => {
      const resourceName = report.metadata.labels?.['trivy-operator.resource.name'] || report.metadata.name;
      const resourceKind = report.metadata.labels?.['trivy-operator.resource.kind'] || 'Unknown';
      const reportNamespace = report.metadata.labels?.['trivy-operator.resource.namespace'] || report.metadata.namespace;

      // Filter by current resource
      if (resourceData.resourceName && resourceName !== resourceData.resourceName) {
        return false;
      }

      if (resourceData.namespace && reportNamespace !== resourceData.namespace) {
        return false;
      }

      if (resourceData.resourceType) {
        const normalizedReportKind = resourceKind.toLowerCase();
        const normalizedResourceType = resourceData.resourceType.toLowerCase();
        
        // Handle plural/singular mismatch (e.g., "daemonset" vs "daemonsets")
        const kindMatches = normalizedReportKind === normalizedResourceType ||
                           normalizedReportKind === normalizedResourceType.replace(/s$/, '') ||
                           normalizedReportKind + 's' === normalizedResourceType;
        
        if (!kindMatches) {
          return false;
        }
      }

      return true;
    });

    // Flatten checks from all reports and add metadata
    const allChecks = filtered.flatMap(report => 
      report.report.checks.map((check, index) => ({
        ...check,
        reportMetadata: report.metadata,
        reportSummary: report.report.summary,
        checkKey: `${report.metadata.name}-${index}`
      }))
    );

    // Filter checks by search query
    let filteredChecksList = allChecks.filter(check => {
      const resourceName = check.reportMetadata.labels?.['trivy-operator.resource.name'] || check.reportMetadata.name;
      const resourceKind = check.reportMetadata.labels?.['trivy-operator.resource.kind'] || 'Unknown';
      const reportNamespace = check.reportMetadata.labels?.['trivy-operator.resource.namespace'] || check.reportMetadata.namespace;

      const matchesSearch = searchQuery === "" ||
        check.reportMetadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resourceKind.toLowerCase().includes(searchQuery.toLowerCase()) ||
        check.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        check.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        check.severity.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (check.success ? 'pass' : 'fail').includes(searchQuery.toLowerCase()) ||
        (reportNamespace && reportNamespace.toLowerCase().includes(searchQuery.toLowerCase()));

      // Filter by severity
      if (selectedSeverity !== "all" && check.severity !== selectedSeverity) {
        return false;
      }

      return matchesSearch;
    });

    // Apply sorting
    if (sortField) {
      filteredChecksList.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortField) {
          case 'resource':
            aValue = (a.reportMetadata.labels?.['trivy-operator.resource.name'] || a.reportMetadata.name).toLowerCase();
            bValue = (b.reportMetadata.labels?.['trivy-operator.resource.name'] || b.reportMetadata.name).toLowerCase();
            break;
          case 'kind':
            aValue = (a.reportMetadata.labels?.['trivy-operator.resource.kind'] || 'Unknown').toLowerCase();
            bValue = (b.reportMetadata.labels?.['trivy-operator.resource.kind'] || 'Unknown').toLowerCase();
            break;
          case 'namespace':
            aValue = (a.reportMetadata.labels?.['trivy-operator.resource.namespace'] || a.reportMetadata.namespace || 'N/A').toLowerCase();
            bValue = (b.reportMetadata.labels?.['trivy-operator.resource.namespace'] || b.reportMetadata.namespace || 'N/A').toLowerCase();
            break;
          case 'critical':
            aValue = ('checkID' in a ? (a.checkID || '') : (a.id || '')).toLowerCase();
            bValue = ('checkID' in b ? (b.checkID || '') : (b.id || '')).toLowerCase();
            break;
          case 'severity':
            // Custom severity order for sorting
            const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
            aValue = severityOrder[a.severity as keyof typeof severityOrder] || 0;
            bValue = severityOrder[b.severity as keyof typeof severityOrder] || 0;
            break;
          default:
            return 0;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else {
          return sortDirection === 'asc' ? (aValue as number) - (bValue as number) : (bValue as number) - (aValue as number);
        }
      });
    }

    return filteredChecksList;
  }, [configAuditReports, resourceData, searchQuery, selectedSeverity, sortField, sortDirection]);

  // Group checks back by report for display
  const filteredReports = useMemo(() => {
    const reportMap = new Map();
    
    filteredChecks.forEach(check => {
      const reportName = check.reportMetadata.name;
      if (!reportMap.has(reportName)) {
        reportMap.set(reportName, {
          metadata: check.reportMetadata,
          report: {
            summary: check.reportSummary,
            checks: []
          }
        });
      }
      reportMap.get(reportName).report.checks.push(check);
    });

    return Array.from(reportMap.values());
  }, [filteredChecks]);

  // Calculate security metrics from filtered reports
  const securityMetrics = useMemo(() => {
    let low = 0;
    let medium = 0;
    let high = 0;
    let critical = 0;

    filteredReports.forEach(report => {
      low += report.report.summary.lowCount;
      medium += report.report.summary.mediumCount;
      high += report.report.summary.highCount;
      critical += report.report.summary.criticalCount;
    });

    return { low, medium, high, critical };
  }, [filteredReports]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin dark:text-gray-300" />
        <span className="ml-2 text-sm text-gray-500">Loading audit reports...</span>
      </div>
    );
  }

  if (!isTrivyInstalled) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-orange-500 mb-2">Trivy Not Installed</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Trivy Operator is required for security audit reports.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-red-500 mb-2">Error</h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Security Metrics Cards */}
      <div className="grid grid-cols-4 gap-1 mb-6">
        <Card className="bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800/20 rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
          <CardContent className="py-2 px-2 flex flex-col h-full">
            <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Critical</h2>
            <div className="mt-auto">
              <p className="text-4xl font-light text-red-600 dark:text-red-400 mb-1">{securityMetrics.critical}</p>
              <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                <div className="h-1 bg-red-500 dark:bg-red-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800/20 rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
          <CardContent className="py-2 px-2 flex flex-col h-full">
            <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">High</h2>
            <div className="mt-auto">
              <p className="text-4xl font-light text-orange-600 dark:text-orange-400 mb-1">{securityMetrics.high}</p>
              <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                <div className="h-1 bg-orange-500 dark:bg-orange-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800/20 rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
          <CardContent className="py-2 px-2 flex flex-col h-full">
            <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Medium</h2>
            <div className="mt-auto">
              <p className="text-4xl font-light text-yellow-600 dark:text-yellow-400 mb-1">{securityMetrics.medium}</p>
              <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                <div className="h-1 bg-yellow-500 dark:bg-yellow-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gray-50 dark:bg-transparent dark:hover:bg-gray-800/20 rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
          <CardContent className="py-2 px-2 flex flex-col h-full">
            <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Low</h2>
            <div className="mt-auto">
              <p className="text-4xl font-light text-blue-600 dark:text-blue-400 mb-1">{securityMetrics.low}</p>
              <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                <div className="h-1 bg-blue-500 dark:bg-blue-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter Controls */}
      <div className="mb-4 flex gap-4">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Search configuration checks..."
            className="w-full border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="min-w-[150px]">
          <Select value={selectedSeverity} onValueChange={(value) => setSelectedSeverity(value as SeverityLevel | "all")}>
            <SelectTrigger className="border border-gray-400 dark:border-gray-800/50 dark:bg-transparent h-full">
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="text-xs mb-4 flex items-center gap-2">
        <span className="text-gray-600 dark:text-gray-400">{filteredChecks.length} checks from {filteredReports.length} reports</span>
      </div>

      {filteredReports.length > 0 ? (
        <Card className="bg-transparent border-gray-200 dark:border-gray-800/50">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                <TableHead className="w-8"></TableHead>
                <TableHead
                  className="cursor-pointer hover:text-blue-500"
                  onClick={() => handleSort('critical')}
                >
                  <div className="flex items-center gap-1">
                    ID
                    {getSortIcon('critical')}
                  </div>
                </TableHead>
                <TableHead>Title & Description</TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:text-blue-500"
                  onClick={() => handleSort('severity')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Severity
                    {getSortIcon('severity')}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.flatMap((report) => {
                // Use the basic report checks
                const checksToDisplay = report.report.checks;

                if (!checksToDisplay || checksToDisplay.length === 0) {
                  return (
                    <TableRow key={report.metadata.name} className="bg-gray-100 dark:bg-gray-800/20">
                      <TableCell colSpan={4} className="p-4">
                        <div className="text-center py-8">
                          <Info className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                          <p className="text-sm text-gray-500 dark:text-gray-400">No configuration audit checks found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return checksToDisplay.map((check: TrivyConfigAuditCheck, index: number) => {
                  const checkKey = `${report.metadata.name}-${index}`;
                  const isExpanded = expandedChecks.has(checkKey);
                  
                  return (
                    <React.Fragment key={checkKey}>
                      <TableRow 
                        className="bg-gray-50 dark:bg-gray-800/10 border-b border-gray-300 dark:border-gray-700/50 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                        onClick={() => toggleCheckExpansion(checkKey)}
                      >
                        <TableCell className="w-8">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm text-blue-600 dark:text-blue-400">
                            {'checkID' in check ? check.checkID : ""}
                          </span>
                        </TableCell>
                        <TableCell className='max-w-96'>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm">{check.title}</h4>
                              <Badge className={`text-xs ${
                                check.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              }`}>
                                {check.success ? 'PASS' : 'FAIL'}
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">{check.description}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Badge className={`text-xs ${
                              check.severity === 'CRITICAL' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                              check.severity === 'HIGH' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                              check.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                              'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            }`}>
                              {check.severity}
                            </Badge>
                            {/* <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleResolveClick(check, report);
                                    }}
                                  >
                                    Resolve <ArrowUpRight className="h-3 w-3 ml-1" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Ask Agentkube to Resolve</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider> */}
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Check Details */}
                      {isExpanded && (
                        <TableRow className="bg-gray-100 dark:bg-gray-800/20">
                          <TableCell colSpan={4} className="p-4">
                            <div className="space-y-3">
                              <div className="text-xs">
                                <span className="font-medium text-gray-600 dark:text-gray-400">Category:</span>
                                <span className="ml-1">{check.category}</span>
                              </div>
                              
                              {check.messages && check.messages.length > 0 && (
                                <div className="text-xs">
                                  <span className="font-medium text-gray-600 dark:text-gray-400">Messages:</span>
                                  <ul className="list-disc list-inside mt-1 text-gray-500 space-y-1">
                                    {check.messages.map((message: string, msgIndex: number) => (
                                      <li key={msgIndex}>
                                        <MarkdownContent content={message} />
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                });
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="text-center py-16 bg-transparent dark:bg-transparent rounded-xl border border-gray-200 dark:border-gray-800/30">
          <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-medium mb-2">No Vulnerability Reports Found</h3>
          <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            No configuration audit reports were found for this resource.
            Try ensuring Trivy is properly configured.
          </p>
        </div>
      )}
    </div>
  );
};