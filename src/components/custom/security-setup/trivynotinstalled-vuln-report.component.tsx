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
import { VULN_REPORT_DEMO_DATA } from '@/constants/vuln-report-demo-data.constant';
import { VulnerabilityReportItem } from "@/types/scanner/vulnerability-report";
import { containerVariants, itemVariants } from "@/utils/styles.utils";
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { useNavigate } from "react-router-dom";
import DemoVideoDialog from '@/components/custom/demovideodialog/demovideodialog.component';
import { DEMO_VIDEOS } from '@/constants/demo.constants';

const SEVERITY_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"] as const;

interface TrivyNotInstalledVulnReportProps {
  title: string;
  subtitle: string;
  onInstallSuccess: () => void;
}

const TrivyNotInstalledVulnReport: React.FC<TrivyNotInstalledVulnReportProps> = ({ title, subtitle, onInstallSuccess }) => {
  const [isInstallDialogOpen, setIsInstallDialogOpen] = useState(false);
  const navigate = useNavigate();

  // Demo data state
  const [vulnerabilityReports] = useState<VulnerabilityReportItem[]>(VULN_REPORT_DEMO_DATA);

  // For the details drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedReportForDrawer, setSelectedReportForDrawer] = useState<VulnerabilityReportItem | null>(null);

  // For the demo dialog
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  
  // For button animation
  const [isButtonExpanded, setIsButtonExpanded] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<"CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | "all">("all");

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

  const handleCheckClick = (report: VulnerabilityReportItem) => {
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
    let filtered = vulnerabilityReports.filter(report => {
      const resourceKind = report.owner.kind;
      const reportNamespace = report.namespace;

      const matchesSearch = searchQuery === "" ||
        report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resourceKind.toLowerCase().includes(searchQuery.toLowerCase()) ||
        reportNamespace.toLowerCase().includes(searchQuery.toLowerCase());

      if (selectedSeverity === "all") {
        return matchesSearch;
      }

      // Filter by severity - check if report has vulnerabilities with the selected severity
      const hasSeverity = selectedSeverity === "CRITICAL" ? report.summary.critical > 0 :
                         selectedSeverity === "HIGH" ? report.summary.high > 0 :
                         selectedSeverity === "MEDIUM" ? report.summary.medium > 0 :
                         selectedSeverity === "LOW" ? report.summary.low > 0 :
                         selectedSeverity === "UNKNOWN" ? report.summary.unknown > 0 : false;
      return matchesSearch && hasSeverity;
    });

    // Apply sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortField) {
          case 'resource':
            aValue = a.name.toLowerCase();
            bValue = b.name.toLowerCase();
            break;
          case 'kind':
            aValue = a.owner.kind.toLowerCase();
            bValue = b.owner.kind.toLowerCase();
            break;
          case 'namespace':
            aValue = a.namespace.toLowerCase();
            bValue = b.namespace.toLowerCase();
            break;
          case 'critical':
            aValue = a.summary.critical;
            bValue = b.summary.critical;
            break;
          case 'high':
            aValue = a.summary.high;
            bValue = b.summary.high;
            break;
          case 'medium':
            aValue = a.summary.medium;
            bValue = b.summary.medium;
            break;
          case 'low':
            aValue = a.summary.low;
            bValue = b.summary.low;
            break;
          case 'unknown':
            aValue = a.summary.unknown;
            bValue = b.summary.unknown;
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
  }, [vulnerabilityReports, searchQuery, selectedSeverity, sortField, sortDirection]);

  // Calculate security metrics from all filtered reports
  const securityMetrics = useMemo(() => {
    let low = 0;
    let medium = 0;
    let high = 0;
    let critical = 0;
    let unknown = 0;

    filteredReports.forEach(report => {
      low += report.summary.low;
      medium += report.summary.medium;
      high += report.summary.high;
      critical += report.summary.critical;
      unknown += report.summary.unknown;
    });

    return { low, medium, high, critical, unknown };
  }, [filteredReports]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedSeverity("all");
    setSortField(null);
    setSortDirection('asc');
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
                Sample data: Install Trivy to see cluster vulnerability report
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
          <div className="grid grid-cols-5 gap-1 mb-6">
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
            <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
              <CardContent className="py-2 flex flex-col h-full">
                <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Unknown</h2>
                <div className="mt-auto">
                  <p className="text-4xl font-light text-green-600 dark:text-green-400 mb-1">{securityMetrics.unknown}</p>
                  <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                    <div className="h-1 bg-green-500 dark:bg-green-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
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
              <Select
                value="all-namespaces"
                onValueChange={() => {}}
              >
                <SelectTrigger className="border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent">
                  <SelectValue placeholder="All Namespaces" />
                </SelectTrigger>
                <SelectContent className="dark:bg-[#0B0D13]/30 backdrop-blur-md">
                  <SelectItem value="all-namespaces">All Namespaces</SelectItem>
                  <SelectItem value="default">default</SelectItem>
                  <SelectItem value="production">production</SelectItem>
                  <SelectItem value="backend">backend</SelectItem>
                  <SelectItem value="frontend">frontend</SelectItem>
                  <SelectItem value="database">database</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select
              value={selectedSeverity}
              onValueChange={(value) => setSelectedSeverity(value as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN" | "all")}
            >
              <SelectTrigger className="w-32 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent">
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
                      <TableHead className="text-center text-xs font-medium text-gray-600 dark:text-gray-400 border-x border-t dark:bg-gray-700/10" colSpan={5}>
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
                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('unknown')}
                      >
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1">
                                UNKNOWN
                                {getSortIcon('unknown')}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="p-1">
                              <p>Unknown severity of vulnerabilities</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReports.map((report) => (
                      <TableRow
                        key={report.name}
                        className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                        onClick={() => handleCheckClick(report)}
                      >
                        <TableCell>
                          <div className={`w-2 h-2 rounded-full ${report.summary.critical > 0 ? 'bg-red-500' :
                            report.summary.high > 0 ? 'bg-orange-500' :
                              report.summary.medium > 0 ? 'bg-yellow-500' :
                                'bg-green-500'
                            }`}></div>
                        </TableCell>
                        <TableCell className="text-blue-500">{report.name}</TableCell>
                        <TableCell>{report.owner.kind}</TableCell>
                        <TableCell>
                          <span className="dark:text-blue-500 text-blue-500 hover:text-blue-500 dark:hover:text-blue-400 cursor-pointer" onClick={() => navigate(`/dashboard/explore/namespaces/${report.namespace}`)}>
                            {report.namespace}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-red-600 font-medium">{report.summary.critical}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-orange-600 font-medium">{report.summary.high}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-yellow-600 font-medium">{report.summary.medium}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-blue-600 font-medium">{report.summary.low}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-green-600 font-medium">{report.summary.unknown}</span>
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
              <h3 className="text-xl font-medium mb-2">No Vulnerability Reports Found</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                No vulnerability reports were found for the selected filter criteria.
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
                  <h2 className=" dark:text-gray-500">{selectedReportForDrawer.owner.kind}</h2>
                  <h2 className="">{selectedReportForDrawer.name}</h2>
                </div>
                <div className="grid grid-cols-1 gap-1 text-sm">
                  <div>
                    <span className="font-light text-gray-600 dark:text-gray-500">Namespace</span>
                    <span className="ml-1 cursor-pointer text-blue-500 hover:text-blue-400 font-medium" onClick={() => navigate(`/dashboard/explore/namespaces/${selectedReportForDrawer.namespace}`)}>{selectedReportForDrawer.namespace}</span>
                  </div>
                  <div>
                    <span className="font-light text-gray-600 dark:text-gray-500">Owner</span>
                    <span className="ml-1 text-gray-600 dark:text-gray-400 font-medium">{selectedReportForDrawer.owner.kind}/{selectedReportForDrawer.owner.name}</span>
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="grid grid-cols-5 gap-1">
                  <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
                    <CardContent className="p-2 flex flex-col h-full">
                      <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Critical</h2>
                      <div className="mt-auto">
                        <p className="text-4xl font-light text-red-600 dark:text-red-400 mb-1">{selectedReportForDrawer.summary.critical}</p>
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
                        <p className="text-4xl font-light text-orange-600 dark:text-orange-400 mb-1">{selectedReportForDrawer.summary.high}</p>
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
                        <p className="text-4xl font-light text-yellow-600 dark:text-yellow-400 mb-1">{selectedReportForDrawer.summary.medium}</p>
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
                        <p className="text-4xl font-light text-blue-600 dark:text-blue-400 mb-1">{selectedReportForDrawer.summary.low}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div className="h-1 bg-blue-500 dark:bg-blue-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
                    <CardContent className="p-2 flex flex-col h-full">
                      <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">Unknown</h2>
                      <div className="mt-auto">
                        <p className="text-4xl font-light text-green-600 dark:text-green-400 mb-1">{selectedReportForDrawer.summary.unknown}</p>
                        <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                          <div className="h-1 bg-green-500 dark:bg-green-400 rounded-[0.3rem]" style={{ width: '100%' }}></div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div>
                <h4 className="text-sm uppercase dark:text-gray-500 mb-3">Vulnerability Summary</h4>
                <div className="text-center py-8">
                  <Info className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">Detailed vulnerability information for {selectedReportForDrawer.owner.kind} {selectedReportForDrawer.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Install Trivy to see individual vulnerability details</p>
                  
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/20 rounded">
                      <span className="text-sm font-medium">Total Vulnerabilities:</span>
                      <span className="text-sm font-bold">{selectedReportForDrawer.summary.critical + selectedReportForDrawer.summary.high + selectedReportForDrawer.summary.medium + selectedReportForDrawer.summary.low + selectedReportForDrawer.summary.unknown}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/20 rounded">
                      <span className="text-sm font-medium">Age:</span>
                      <span className="text-sm">{selectedReportForDrawer.age}</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-800/20 rounded">
                      <span className="text-sm font-medium">Created:</span>
                      <span className="text-sm">{new Date(selectedReportForDrawer.creationTimestamp).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DrawerContent>
      </SideDrawer>

      {/* Demo Dialog */}
      <DemoVideoDialog
        isOpen={isDemoOpen}
        onClose={() => setIsDemoOpen(false)}
        videoUrl={DEMO_VIDEOS.SECURITY_DEMO.videoUrl}
        title={DEMO_VIDEOS.SECURITY_DEMO.title}
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

export default TrivyNotInstalledVulnReport;