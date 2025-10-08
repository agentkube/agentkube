import React, { useState, useMemo, useEffect } from 'react';
import { motion } from "framer-motion";
import { AlertCircle, Info, ArrowUpDown, ArrowUp, ArrowDown, ArrowUpRight, Download, Play } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import TrivyInstallDialog from './security-setup-dialog.component';
import { AUDIT_REPORT_DEMO_DATA } from '@/constants/audit-report-demo-data.constant';
import { TrivyConfigAuditReport, TrivyConfigAuditCheck, SeverityLevel } from "@/types/trivy";
import { containerVariants, itemVariants } from "@/utils/styles.utils";
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import MarkdownContent from "@/utils/markdown-formatter";
import { useNavigate } from "react-router-dom";
import { NamespaceSelector } from '@/components/custom';
import { useDrawer } from '@/contexts/useDrawer';
import { toast } from '@/hooks/use-toast';
import DemoVideoDialog from '@/components/custom/demovideodialog/demovideodialog.component';

const SEVERITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

interface TrivyNotInstalledAuditReportProps {
  title: string;
  subtitle: string;
  onInstallSuccess: () => void;
}

const TrivyNotInstalledAuditReport: React.FC<TrivyNotInstalledAuditReportProps> = ({ title, subtitle, onInstallSuccess }) => {
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { addStructuredContent } = useDrawer();

  // Demo data state
  const [configAuditReports] = useState<TrivyConfigAuditReport[]>(AUDIT_REPORT_DEMO_DATA);

  // For the details drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedReportForDrawer, setSelectedReportForDrawer] = useState<TrivyConfigAuditReport | null>(null);

  // For the demo dialog
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  
  // For button animation
  const [isButtonExpanded, setIsButtonExpanded] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityLevel | "all">("all");

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Button animation effect
  useEffect(() => {
    const expandTimer = setTimeout(() => {
      setIsButtonExpanded(true);
    }, 500);
    
    const collapseTimer = setTimeout(() => {
      setIsButtonExpanded(false);
    }, 3000); // 500ms + 2500ms = 3000ms total
    
    return () => {
      clearTimeout(expandTimer);
      clearTimeout(collapseTimer);
    };
  }, []);

  const handleInstallSuccess = () => {
    setIsInstallDialogOpen(false);
    onInstallSuccess();
  };

  const handleCheckClick = (report: TrivyConfigAuditReport) => {
    setSelectedReportForDrawer(report);
    setIsDrawerOpen(true);
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

  const filteredReports = useMemo(() => {
    let filtered = configAuditReports.filter(report => {
      // Extract resource info from metadata or report name
      const resourceName = report.metadata.labels?.['trivy-operator.resource.name'] || report.metadata.name;
      const resourceKind = report.metadata.labels?.['trivy-operator.resource.kind'] || 'Unknown';
      const reportNamespace = report.metadata.labels?.['trivy-operator.resource.namespace'] || report.metadata.namespace;

      const matchesSearch = searchQuery === "" ||
        report.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resourceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resourceKind.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (reportNamespace && reportNamespace.toLowerCase().includes(searchQuery.toLowerCase()));

      if (selectedSeverity === "all") {
        return matchesSearch;
      }

      // Filter by severity - check if report has checks with the selected severity
      const hasSeverity = report.report.checks.some(check => check.severity === selectedSeverity);
      return matchesSearch && hasSeverity;
    });

    // Apply sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortField) {
          case 'resource':
            aValue = (a.metadata.labels?.['trivy-operator.resource.name'] || a.metadata.name).toLowerCase();
            bValue = (b.metadata.labels?.['trivy-operator.resource.name'] || b.metadata.name).toLowerCase();
            break;
          case 'kind':
            aValue = (a.metadata.labels?.['trivy-operator.resource.kind'] || 'Unknown').toLowerCase();
            bValue = (b.metadata.labels?.['trivy-operator.resource.kind'] || 'Unknown').toLowerCase();
            break;
          case 'namespace':
            aValue = (a.metadata.labels?.['trivy-operator.resource.namespace'] || a.metadata.namespace || 'N/A').toLowerCase();
            bValue = (b.metadata.labels?.['trivy-operator.resource.namespace'] || b.metadata.namespace || 'N/A').toLowerCase();
            break;
          case 'critical':
            aValue = a.report.summary.criticalCount;
            bValue = b.report.summary.criticalCount;
            break;
          case 'high':
            aValue = a.report.summary.highCount;
            bValue = b.report.summary.highCount;
            break;
          case 'medium':
            aValue = a.report.summary.mediumCount;
            bValue = b.report.summary.mediumCount;
            break;
          case 'low':
            aValue = a.report.summary.lowCount;
            bValue = b.report.summary.lowCount;
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

    return filtered;
  }, [configAuditReports, searchQuery, selectedSeverity, sortField, sortDirection]);

  // Calculate security metrics from all filtered reports
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

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedSeverity("all");
    setSortField(null);
    setSortDirection('asc');
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

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="
          max-h-[92vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
      "
    >
      <div className="grid grid-cols-3 gap-6 mb-32 dark:bg-transparent p-6 rounded-3xl">
        <motion.div variants={itemVariants} className="col-span-3">
          <div className="flex justify-between">
            <div className="pb-2">
              <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">{title}</h1>
              <p className="dark:text-gray-500 text-sm max-w-xl">{subtitle}</p>
              <div className="mt-2 p-2 bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 rounded-md text-sm">
                <AlertCircle className="h-4 w-4 inline mr-2" />
                Sample data: Install Trivy to see cluster audit report
              </div>
            </div>

            <div className="flex gap-2 items-start">
              <Button
                onClick={() => setIsDemoOpen(true)}
                className="flex items-center justify-between gap-2 relative overflow-hidden"
              >
                <motion.div
                  initial={{ width: 40 }}
                  animate={{ 
                    width: isButtonExpanded ? 144 : 14 
                  }}
                  transition={{ 
                    duration: 0.4,
                    ease: "easeInOut"
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <Play className="w-4 h-4 flex-shrink-0" />
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ 
                      opacity: isButtonExpanded ? 1 : 0,
                      width: isButtonExpanded ? 'auto' : 0
                    }}
                    transition={{ 
                      duration: 0.3,
                      delay: isButtonExpanded ? 0.2 : 0,
                      ease: "easeOut"
                    }}
                    className="whitespace-nowrap text-sm overflow-hidden"
                  >
                    Watch Demo
                  </motion.span>
                </motion.div>
              </Button>

              <Button>
                {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' })}
              </Button>
              <Button
                onClick={() => setIsInstallDialogOpen(true)}
                className="flex items-center justify-between min-w-44 gap-2 dark:bg-white dark:hover:text-white dark:text-gray-800"
              >
                <Download />
                Install Trivy
              </Button>
            </div>
          </div>

        </motion.div>

        <motion.div variants={itemVariants} className="col-span-3 dark:bg-transparent rounded-2xl">

          {/* Security Metrics Cards */}
          <div className="grid grid-cols-4 gap-1 mb-6">
            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
              <CardContent className="py-2 flex flex-col h-full">
                <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Critical</h2>
                <div className="mt-auto">
                  <p className="text-4xl font-light text-red-600 dark:text-red-400 mb-1">{securityMetrics.critical}</p>
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                    <div className="h-1 bg-red-500 dark:bg-red-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
              <CardContent className="py-2 flex flex-col h-full">
                <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">High</h2>
                <div className="mt-auto">
                  <p className="text-4xl font-light text-orange-600 dark:text-orange-400 mb-1">{securityMetrics.high}</p>
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                    <div className="h-1 bg-orange-500 dark:bg-orange-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
              <CardContent className="py-2 flex flex-col h-full">
                <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Medium</h2>
                <div className="mt-auto">
                  <p className="text-4xl font-light text-yellow-600 dark:text-yellow-400 mb-1">{securityMetrics.medium}</p>
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                    <div className="h-1 bg-yellow-500 dark:bg-yellow-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
              <CardContent className="py-2 flex flex-col h-full">
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

          <div className="mb-4">
            <Input
              type="text"
              placeholder="Enter search keywords"
              className="w-full border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-start gap-4 mb-6">
            <div className="w-48">
              <NamespaceSelector />
            </div>

            <Select
              value={selectedSeverity}
              onValueChange={(value) => setSelectedSeverity(value as SeverityLevel | "all")}
            >
              <SelectTrigger className="w-32 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent h-full">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent className="dark:bg-[#0B0D13]/30 backdrop-blur-md">
                <SelectItem value="all">All</SelectItem>
                {SEVERITY_LEVELS.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {severity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <button
              className="text-blue-600"
              onClick={handleClearFilters}
            >
              Clear all
            </button>
          </div>

          <div className="text-xs mb-4 flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-400">{filteredReports.length} reports</span>
          </div>

          {filteredReports.length > 0 ? (
            <div className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
              <div className="rounded-md ">
                <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
                  <TableHeader>
                    <TableRow className='dark:hover:bg-transparent hover:bg-transparent'>
                      <TableHead className="w-12"></TableHead>
                      <TableHead></TableHead>
                      <TableHead></TableHead>
                      <TableHead></TableHead>
                      <TableHead className="text-center text-xs font-medium text-gray-600 dark:text-gray-400 border-x border-t dark:bg-gray-700/10" colSpan={4}>
                        VULNERABILITIES
                      </TableHead>
                    </TableRow>
                    <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                      <TableHead className="w-12"></TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('resource')}
                      >
                        <div className="flex items-center gap-1">
                          RESOURCE
                          {getSortIcon('resource')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('kind')}
                      >
                        <div className="flex items-center gap-1">
                          KIND
                          {getSortIcon('kind')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('namespace')}
                      >
                        <div className="flex items-center gap-1">
                          NAMESPACE
                          {getSortIcon('namespace')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('critical')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                CRITICAL
                                {getSortIcon('critical')}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="p-1">
                              <p>Critical severity of vulnerabilities</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('high')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                HIGH
                                {getSortIcon('high')}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="p-1">
                              <p>High severity of vulnerabilities</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('medium')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                MEDIUM
                                {getSortIcon('medium')}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="p-1">
                              <p>Medium severity of vulnerabilities</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('low')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                LOW
                                {getSortIcon('low')}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="p-1">
                              <p>Low severity of vulnerabilities</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => (
                      <TableRow
                        key={report.metadata.name}
                        className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                        onClick={() => handleCheckClick(report)}
                      >
                        <TableCell>
                          <div className={`w-2 h-2 rounded-full ${report.report.summary.criticalCount > 0 ? 'bg-red-500' :
                            report.report.summary.highCount > 0 ? 'bg-orange-500' :
                              report.report.summary.mediumCount > 0 ? 'bg-yellow-500' :
                                'bg-green-500'
                            }`}></div>
                        </TableCell>
                        <TableCell className="text-blue-500">{report.metadata.labels?.['trivy-operator.resource.name'] || report.metadata.name}</TableCell>
                        <TableCell>{report.metadata.labels?.['trivy-operator.resource.kind'] || 'Unknown'}</TableCell>
                        <TableCell>
                          <span className="dark:text-blue-500 text-blue-500 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer" onClick={() => navigate(`/dashboard/explore/namespaces/${report.metadata.namespace}`)}>
                            {report.metadata.labels?.['trivy-operator.resource.namespace'] || report.metadata.namespace || 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-red-600 font-medium">{report.report.summary.criticalCount}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-orange-600 font-medium">{report.report.summary.highCount}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-yellow-600 font-medium">{report.report.summary.mediumCount}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-blue-600 font-medium">{report.report.summary.lowCount}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-white/30 dark:bg-gray-900/10 rounded-xl border border-gray-200 dark:border-gray-800/30">
              <Info className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">No Config Audit Reports Found</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                No configuration audit reports were found for the selected filter criteria.
                Try clearing filters or ensure Trivy is properly configured.
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Side Drawer for Report Details */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      >
        <DrawerHeader onClose={() => setIsDrawerOpen(false)}>
          <div className="flex items-center gap-2">

          </div>
        </DrawerHeader>
        <DrawerContent>
          {selectedReportForDrawer && (
            <div className="p-4">
              <div className="mb-6">
                <div className="text-lg flex items-center gap-1">
                  <h2 className=" dark:text-gray-500">{selectedReportForDrawer.metadata.labels?.['trivy-operator.resource.kind'] || 'Unknown'}</h2>
                  <h2 className="">{selectedReportForDrawer.metadata.labels?.['trivy-operator.resource.name'] || selectedReportForDrawer.metadata.name}</h2>
                </div>
                <div className="grid grid-cols-1 gap-1 text-sm">
                  <div>
                    <span className="font-light text-gray-600 dark:text-gray-500">Namespace</span>
                    <span className="ml-1 cursor-pointer text-blue-500 hover:text-blue-400 font-medium" onClick={() => navigate(`/dashboard/explore/namespaces/${selectedReportForDrawer.metadata.namespace}`)}>{selectedReportForDrawer.metadata.labels?.['trivy-operator.resource.namespace'] || selectedReportForDrawer.metadata.namespace || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="grid grid-cols-4 gap-1">
                  <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
                    <CardContent className="p-2 flex flex-col h-full">
                      <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Critical</h2>
                      <div className="mt-auto">
                        <p className="text-4xl font-light text-red-600 dark:text-red-400 mb-1">{selectedReportForDrawer.report.summary.criticalCount}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div className="h-1 bg-red-500 dark:bg-red-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
                    <CardContent className="p-2 flex flex-col h-full">
                      <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">High</h2>
                      <div className="mt-auto">
                        <p className="text-4xl font-light text-orange-600 dark:text-orange-400 mb-1">{selectedReportForDrawer.report.summary.highCount}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div className="h-1 bg-orange-500 dark:bg-orange-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
                    <CardContent className="p-2 flex flex-col h-full">
                      <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Medium</h2>
                      <div className="mt-auto">
                        <p className="text-4xl font-light text-yellow-600 dark:text-yellow-400 mb-1">{selectedReportForDrawer.report.summary.mediumCount}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div className="h-1 bg-yellow-500 dark:bg-yellow-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
                    <CardContent className="p-2 flex flex-col h-full">
                      <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Low</h2>
                      <div className="mt-auto">
                        <p className="text-4xl font-light text-blue-600 dark:text-blue-400 mb-1">{selectedReportForDrawer.report.summary.lowCount}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div className="h-1 bg-blue-500 dark:bg-blue-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div>
                <h4 className="text-sm uppercase dark:text-gray-500 mb-3">Configuration Checks</h4>
                {(() => {
                  const checksToDisplay = selectedReportForDrawer.report.checks;
                  const resourceName = selectedReportForDrawer.metadata.labels?.['trivy-operator.resource.name'] || selectedReportForDrawer.metadata.name;
                  const resourceKind = selectedReportForDrawer.metadata.labels?.['trivy-operator.resource.kind'] || 'resource';

                  if (!checksToDisplay || checksToDisplay.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <Info className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">No configuration audit checks found for {resourceKind} {resourceName}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Configuration checks will appear here when available</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {checksToDisplay.map((check, index) => (
                        <div key={index} className="bg-white dark:bg-gray-800/20 rounded-lg border">

                          <div className="flex items-start justify-between p-2 text-sm dark:bg-gray-700/20">
                            <div className="px-2">
                              <h4>{check.title}</h4>
                              <p className="text-xs text-smtext-gray-600 dark:text-gray-400">{check.description}</p>
                            </div>

                            <div className="flex gap-1 items-center">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${check.severity === 'CRITICAL' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' :
                                check.severity === 'HIGH' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' :
                                  check.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                                    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                }`}>
                                {check.severity}
                              </span>
                              <span className={`px-2 py-1 rounded ${check.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                }`}>
                                {check.success ? 'PASS' : 'FAIL'}
                              </span>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      className="w-24 flex justify-between"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleResolveClick(check, selectedReportForDrawer);
                                      }}
                                    >
                                      Resolve <ArrowUpRight />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="p-1">
                                    <p>Ask Agentkube to Resolve</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                          <div className="p-2">

                            <div className="text-xs dark:text-gray-300">
                              <span className="font-medium text-gray-400 dark:text-gray-500">Check ID</span> {'checkID' in check ? check.checkID : check.id}
                              <span className="ml-4 text-gray-400 dark:text-gray-500 font-medium">Category</span> {check.category}

                            </div>

                            {check.messages.length > 0 && (
                              <div className="mt-2 text-xs">
                                <span className="font-medium text-gray-600 dark:text-gray-400">Messages</span>
                                <ul className="list-disc list-inside mt-1 text-gray-500">
                                  {check.messages.map((message, msgIndex) => (
                                    <li key={msgIndex}>
                                      <MarkdownContent content={message} />
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </DrawerContent>
      </SideDrawer>

      {/* Demo Dialog */}
      <DemoVideoDialog
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        videoId="B63Wx4STwXU"
        title="Trivy Security Scanner Demo - Kubernetes Security Made Simple"
      />

      {/* Install Dialog */}
      <TrivyInstallDialog
        isOpen={isInstallDialogOpen}
        onClose={() => setIsInstallDialogOpen(false)}
        onInstallSuccess={handleInstallSuccess}
      />
    </motion.div>
  );
};

export default TrivyNotInstalledAuditReport;