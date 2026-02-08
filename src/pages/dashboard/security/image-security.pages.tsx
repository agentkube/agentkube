import React, { useState, useMemo, useEffect } from 'react';
import { motion } from "framer-motion";
import { Shield, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Image as ImageIcon, Download, Play, RefreshCw, Filter } from "lucide-react";
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
import { containerVariants, itemVariants } from "@/utils/styles.utils";
import { toast } from '@/hooks/use-toast';
import { useScan } from '@/contexts/useScan';
import { useCluster } from '@/contexts/clusterContext';
import { ScanResult, ImageInfo } from '@/types/vuln';
import { Badge } from '@/components/ui/badge';
import ResourceFilterSidebar, { type ColumnConfig } from '@/components/custom/resourcefiltersidebar/resourcefiltersidebar.component';
import { getStoredColumnConfig, saveColumnConfig, clearColumnConfig } from '@/utils/columnConfigStorage';
import ImageVulnDrawerSecurity from './image-vulnerability/image-vulndrawer.security';

type SeverityLevel = "Critical" | "High" | "Medium" | "Low" | "Unknown";

const SEVERITY_LEVELS = ["Critical", "High", "Medium", "Low"] as const;

interface ImageWithScan {
  imageInfo: ImageInfo;
  scanResult?: ScanResult;
}

const ImageSecurity: React.FC = () => {
  const { currentContext } = useCluster();
  const {
    clusterImages,
    scanResults,
    loading,
    scanning,
    error,
    fetchClusterImages,
    reScan
  } = useScan();

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityLevel | "all">("all");
  const [selectedNamespace, setSelectedNamespace] = useState<string>("all");

  // Sorting states
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Default column configuration
  const defaultColumnConfig: ColumnConfig[] = [
    { key: 'image-repository', label: 'Image Repository', visible: true, canToggle: false },
    { key: 'namespace', label: 'Namespace', visible: true, canToggle: true },
    {
      key: 'vulnerabilities',
      label: 'Vulnerabilities',
      visible: true,
      canToggle: true,
      children: [
        { key: 'critical', label: 'Critical Severity of Vulnerability', visible: true, canToggle: true },
        { key: 'high', label: 'High Severity of Vulnerability', visible: true, canToggle: true },
        { key: 'medium', label: 'Medium Severity of Vulnerability', visible: true, canToggle: true },
        { key: 'low', label: 'Low Severity of Vulnerability', visible: true, canToggle: true }
      ]
    },
    { key: 'fixes', label: 'Fixes', visible: true, canToggle: true },
    { key: 'status', label: 'Status', visible: true, canToggle: false }
  ];

  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(() =>
    getStoredColumnConfig('image-security', defaultColumnConfig)
  );
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedImageInfo, setSelectedImageInfo] = useState<ImageInfo | null>(null);

  // Load cluster images on mount
  useEffect(() => {
    if (currentContext && clusterImages.length === 0) {
      fetchClusterImages();
    }
  }, [currentContext, clusterImages.length, fetchClusterImages]);

  // Column management functions
  const handleColumnToggle = (columnKey: string, visible: boolean) => {
    setColumnConfig(prev => {
      const updated = prev.map(col => {
        // Check if it's a top-level column
        if (col.key === columnKey) {
          return { ...col, visible };
        }

        // Check if it's a child column
        if (col.children) {
          const updatedChildren = col.children.map(child =>
            child.key === columnKey ? { ...child, visible } : child
          );

          // Check if any child was actually updated
          const hasChanges = updatedChildren.some((child, index) =>
            child.visible !== col.children![index].visible
          );

          if (hasChanges) {
            return { ...col, children: updatedChildren };
          }
        }

        return col;
      });
      // Save to localStorage
      saveColumnConfig('image-security', updated);
      return updated;
    });
  };

  const handleColumnReorder = (reorderedColumns: ColumnConfig[]) => {
    setColumnConfig(reorderedColumns);
    // Save to localStorage
    saveColumnConfig('image-security', reorderedColumns);
  };

  const handleResetToDefault = () => {
    const resetConfig = defaultColumnConfig.map(col => ({ ...col, visible: true }));
    setColumnConfig(resetConfig);
    // Clear from localStorage to use defaults
    clearColumnConfig('image-security');
  };

  const isColumnVisible = (columnKey: string) => {
    // Check if it's a top-level column
    const topLevelColumn = columnConfig.find(col => col.key === columnKey);
    if (topLevelColumn) {
      return topLevelColumn.visible;
    }

    // Check if it's a child column
    for (const col of columnConfig) {
      if (col.children) {
        const childColumn = col.children.find(child => child.key === columnKey);
        if (childColumn) {
          return childColumn.visible;
        }
      }
    }

    return true;
  };

  // Helper function to get all visible children from columnConfig
  const getVisibleVulnerabilityColumns = () => {
    const vulnColumn = columnConfig.find(col => col.key === 'vulnerabilities');
    if (!vulnColumn || !vulnColumn.children) return [];
    return vulnColumn.children.filter(child => child.visible);
  };

  // Helper function to render vulnerability table headers
  const renderVulnerabilityHeaders = () => {
    const visibleColumns = getVisibleVulnerabilityColumns();

    return visibleColumns.map(column => {
      const config = {
        critical: { letter: 'C', color: 'border-red-500', bgColor: 'bg-red-500', tooltip: 'Critical severity of vulnerability' },
        high: { letter: 'H', color: 'border-orange-500', bgColor: 'bg-orange-500', tooltip: 'High severity of vulnerability' },
        medium: { letter: 'M', color: 'border-yellow-500', bgColor: 'bg-yellow-500', tooltip: 'Medium severity of vulnerability' },
        low: { letter: 'L', color: 'border-blue-500', bgColor: 'bg-blue-500', tooltip: 'Low severity of vulnerability' }
      }[column.key];

      if (!config) return null;

      return (
        <TableHead
          key={column.key}
          className={`cursor-pointer hover:text-blue-500 text-center border-b-2 ${config.color}`}
          onClick={() => handleSort(column.key)}
        >
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center justify-center gap-1">
                  {config.letter}
                  {getSortIcon(column.key)}
                </div>
              </TooltipTrigger>
              <TooltipContent className="p-1 flex items-center gap-1.5">
                <div className={`${config.bgColor} py-1 px-2 rounded-md`}>
                  {config.letter}
                </div>
                <p>{config.tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableHead>
      );
    });
  };

  // Helper function to render vulnerability table cells
  const renderVulnerabilityCells = (scanResult?: ScanResult) => {
    const visibleColumns = getVisibleVulnerabilityColumns();

    return visibleColumns.map(column => {
      const config = {
        critical: { count: scanResult?.summary.critical ?? 0, color: 'text-red-600' },
        high: { count: scanResult?.summary.high ?? 0, color: 'text-orange-600' },
        medium: { count: scanResult?.summary.medium ?? 0, color: 'text-yellow-600' },
        low: { count: scanResult?.summary.low ?? 0, color: 'text-blue-600' }
      }[column.key];

      if (!config) return null;

      return (
        <TableCell key={column.key} className="text-center">
          <span className={`${config.color} font-medium ${(!scanResult || config.count === 0) ? 'opacity-40' : ''}`}>
            {config.count}
          </span>
        </TableCell>
      );
    });
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

  // Combine images with their scan results
  const imagesWithScans = useMemo<ImageWithScan[]>(() => {
    // Group cluster images by unique image name
    const uniqueImages = new Map<string, ImageInfo>();

    clusterImages.forEach(img => {
      if (!uniqueImages.has(img.image)) {
        uniqueImages.set(img.image, img);
      }
    });

    // Combine with scan results
    return Array.from(uniqueImages.values()).map(imageInfo => {
      const scanResult = scanResults.find(result => result.image === imageInfo.image);
      return { imageInfo, scanResult };
    });
  }, [clusterImages, scanResults]);

  const filteredImages = useMemo(() => {
    let filtered = imagesWithScans.filter(({ imageInfo, scanResult }) => {
      // Search filter
      const matchesSearch = searchQuery === "" ||
        imageInfo.image.toLowerCase().includes(searchQuery.toLowerCase()) ||
        imageInfo.namespace.toLowerCase().includes(searchQuery.toLowerCase()) ||
        imageInfo.podName.toLowerCase().includes(searchQuery.toLowerCase());

      // Namespace filter
      const matchesNamespace = selectedNamespace === "all" || imageInfo.namespace === selectedNamespace;

      // Severity filter
      if (selectedSeverity === "all") {
        return matchesSearch && matchesNamespace;
      }

      // Check if scan result has vulnerabilities with the selected severity
      if (!scanResult?.vulnerabilities) return false;

      const hasSeverity = scanResult.vulnerabilities.some(
        vuln => vuln.severity === selectedSeverity
      );

      return matchesSearch && matchesNamespace && hasSeverity;
    });

    // Apply sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (sortField) {
          case 'image':
            aValue = a.imageInfo.image.toLowerCase();
            bValue = b.imageInfo.image.toLowerCase();
            break;
          case 'namespace':
            aValue = a.imageInfo.namespace.toLowerCase();
            bValue = b.imageInfo.namespace.toLowerCase();
            break;
          case 'critical':
            aValue = a.scanResult?.summary.critical || 0;
            bValue = b.scanResult?.summary.critical || 0;
            break;
          case 'high':
            aValue = a.scanResult?.summary.high || 0;
            bValue = b.scanResult?.summary.high || 0;
            break;
          case 'medium':
            aValue = a.scanResult?.summary.medium || 0;
            bValue = b.scanResult?.summary.medium || 0;
            break;
          case 'low':
            aValue = a.scanResult?.summary.low || 0;
            bValue = b.scanResult?.summary.low || 0;
            break;
          case 'fixes':
            // Count vulnerabilities with fix versions
            aValue = a.scanResult?.vulnerabilities?.filter(v => v.fixVersion).length || 0;
            bValue = b.scanResult?.vulnerabilities?.filter(v => v.fixVersion).length || 0;
            break;
          case 'status':
            aValue = a.scanResult?.status || 'unknown';
            bValue = b.scanResult?.status || 'unknown';
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
  }, [imagesWithScans, searchQuery, selectedSeverity, selectedNamespace, sortField, sortDirection]);

  // Calculate security metrics from all filtered images
  const securityMetrics = useMemo(() => {
    let low = 0;
    let medium = 0;
    let high = 0;
    let critical = 0;
    let total = 0;

    filteredImages.forEach(({ scanResult }) => {
      if (scanResult) {
        low += scanResult.summary.low;
        medium += scanResult.summary.medium;
        high += scanResult.summary.high;
        critical += scanResult.summary.critical;
        total += scanResult.summary.total;
      }
    });

    return { low, medium, high, critical, total };
  }, [filteredImages]);

  // Get unique namespaces for filter
  const namespaces = useMemo(() => {
    const namespaceSet = new Set(clusterImages.map(img => img.namespace));
    return Array.from(namespaceSet).sort();
  }, [clusterImages]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedSeverity("all");
    setSelectedNamespace("all");
    setSortField(null);
    setSortDirection('asc');
  };

  const handleScanAll = async () => {
    if (!currentContext) {
      toast({
        title: "No Cluster Selected",
        description: "Please select a cluster first",
        variant: "destructive"
      });
      return;
    }

    try {
      await reScan();
    } catch (err) {
      console.error('Error scanning images:', err);
    }
  };

  const handleRefresh = async () => {
    if (!currentContext) {
      toast({
        title: "No Cluster Selected",
        description: "Please select a cluster first",
        variant: "destructive"
      });
      return;
    }

    await fetchClusterImages();
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Scanned</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">Scanning</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Failed</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-400">Not Scanned</Badge>;
    }
  };

  // Helper function to parse image and tag
  const parseImageAndTag = (imageString: string) => {
    const lastColonIndex = imageString.lastIndexOf(':');
    if (lastColonIndex === -1) {
      return { image: imageString, tag: 'latest' };
    }

    const image = imageString.substring(0, lastColonIndex);
    const tag = imageString.substring(lastColonIndex + 1);

    return { image, tag };
  };

  // Handle image row click to open drawer
  const handleImageClick = (imageInfo: ImageInfo) => {
    setSelectedImageInfo(imageInfo);
    setIsDrawerOpen(true);
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
              <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">Image Security</h1>
              <p className="dark:text-gray-500 text-sm max-w-xl">
                Scan and monitor container images for security vulnerabilities
              </p>
            </div>

            <div className="flex gap-2 items-start">
              <Button
                onClick={handleRefresh}
                disabled={loading}
                className="flex items-center gap-2"
                variant="ghost"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={handleScanAll}
                disabled={scanning || loading || clusterImages.length === 0}
                className="flex items-center justify-between min-w-44 gap-2 dark:bg-white dark:hover:text-white dark:text-gray-800"
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Scan All Images
                  </>
                )}
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

          <div className="flex items-center gap-4 mb-4">
            <Input
              type="text"
              placeholder="Search by image name, namespace, or pod..."
              className="flex-1 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <Select
              value={selectedNamespace}
              onValueChange={(value) => setSelectedNamespace(value)}
            >
              <SelectTrigger className="w-48 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent h-full">
                <SelectValue placeholder="Namespace" />
              </SelectTrigger>
              <SelectContent className="dark:bg-card/30 backdrop-blur-md">
                <SelectItem value="all">All Namespaces</SelectItem>
                {namespaces.map((ns) => (
                  <SelectItem key={ns} value={ns}>
                    {ns}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedSeverity}
              onValueChange={(value) => setSelectedSeverity(value as SeverityLevel | "all")}
            >
              <SelectTrigger className="w-32 border border-gray-400 dark:border-gray-800/50 rounded-md dark:bg-transparent h-full">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent className="dark:bg-card/30 backdrop-blur-md">
                <SelectItem value="all">All</SelectItem>
                {SEVERITY_LEVELS.map((severity) => (
                  <SelectItem key={severity} value={severity}>
                    {severity}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center mb-6">
            <button
              className="text-blue-600"
              onClick={handleClearFilters}
            >
              Clear all
            </button>
          </div>

          <div className="text-xs mb-4 flex items-center justify-between gap-2 relative z-20">
            <span className="text-gray-600 dark:text-gray-400">
              {filteredImages.length} images | {securityMetrics.total} total vulnerabilities
            </span>
            <Button
              variant="ghost"
              // size="sm"
              onClick={() => setIsFilterSidebarOpen(true)}
              className="flex items-center gap-2  dark:text-gray-300/80"
              title="Filter columns"
            >
              <Filter className="h-4 w-4" />
            </Button>
          </div>

          {loading && clusterImages.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin mr-2 text-blue-500" />
              <span className="text-gray-500">Loading cluster images...</span>
            </div>
          ) : filteredImages.length > 0 ? (
            <div className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none relative -mt-12">
              <div className="rounded-md">
                <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
                  <TableHeader>
                    <TableRow className='dark:hover:bg-transparent hover:bg-transparent'>
                      {columnConfig.map(column => {
                        if (!column.visible) return null;

                        if (column.key === 'vulnerabilities') {
                          const visibleVulnCount = getVisibleVulnerabilityColumns().length;
                          if (visibleVulnCount === 0) return null;
                          return (
                            <TableHead
                              key={column.key}
                              className="text-center text-xs font-medium text-gray-600 dark:text-gray-400 border-x border-t dark:bg-gray-700/10"
                              colSpan={visibleVulnCount}
                            >
                              VULNERABILITIES
                            </TableHead>
                          );
                        } else if (column.key !== 'status' && column.key !== 'fixes' && column.key !== 'image-repository' && column.key !== 'namespace') {
                          return null;
                        } else {
                          return <TableHead key={column.key}></TableHead>;
                        }
                      })}
                    </TableRow>
                    <TableRow className="border-x-2 border-gray-400 dark:border-gray-800/80">
                      {columnConfig.map(column => {
                        if (!column.visible) return null;

                        switch (column.key) {
                          case 'image-repository':
                            return (
                              <TableHead
                                key={column.key}
                                className="cursor-pointer hover:text-blue-500 w-96"
                                onClick={() => handleSort('image')}
                              >
                                <div className="flex items-center gap-1">
                                  IMAGE REPOSITORY
                                  {getSortIcon('image')}
                                </div>
                              </TableHead>
                            );

                          case 'namespace':
                            return (
                              <TableHead
                                key={column.key}
                                className="cursor-pointer hover:text-blue-500"
                                onClick={() => handleSort('namespace')}
                              >
                                <div className="flex items-center gap-1">
                                  NAMESPACE
                                  {getSortIcon('namespace')}
                                </div>
                              </TableHead>
                            );

                          case 'vulnerabilities':
                            return renderVulnerabilityHeaders();

                          case 'fixes':
                            return (
                              <TableHead
                                key={column.key}
                                className="cursor-pointer hover:text-blue-500 text-center"
                                onClick={() => handleSort('fixes')}
                              >
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div className="flex items-center justify-center gap-1">
                                        FIXES
                                        {getSortIcon('fixes')}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent className="p-1">
                                      <p>Available fixes</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableHead>
                            );

                          case 'status':
                            return (
                              <TableHead
                                key={column.key}
                                className="cursor-pointer hover:text-blue-500"
                                onClick={() => handleSort('status')}
                              >
                                <div className="flex items-center gap-1">
                                  STATUS
                                  {getSortIcon('status')}
                                </div>
                              </TableHead>
                            );

                          default:
                            return null;
                        }
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredImages.map(({ imageInfo, scanResult }, index) => {
                      const fixCount = scanResult?.vulnerabilities?.filter(v => v.fixVersion).length || 0;
                      const hasVulns = scanResult && scanResult.summary.total > 0;

                      return (
                        <TableRow
                          key={`${imageInfo.image}-${imageInfo.namespace}-${imageInfo.podName}`}
                          className="bg-gray-50 dark:bg-transparent border-x-2 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                          onClick={() => handleImageClick(imageInfo)}
                        >
                          {columnConfig.map(column => {
                            if (!column.visible) return null;

                            switch (column.key) {
                              case 'image-repository':
                                const { image, tag } = parseImageAndTag(imageInfo.image);
                                return (
                                  <TableCell key={column.key} className="max-w-96">
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className="cursor-pointer">
                                            <div className="text-blue-500 font-mono text-xs truncate">
                                              {image}
                                            </div>
                                            <div className="text-gray-500 dark:text-gray-400 font-mono text-xs mt-0.5">
                                              Tag: {tag}
                                            </div>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent className="p-2 max-w-xl">
                                          <p className="font-mono text-xs break-all">{imageInfo.image}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </TableCell>
                                );

                              case 'namespace':
                                return (
                                  <TableCell key={column.key}>
                                    <span className="dark:text-blue-500 text-blue-500">
                                      {imageInfo.namespace}
                                    </span>
                                  </TableCell>
                                );

                              case 'vulnerabilities':
                                return renderVulnerabilityCells(scanResult);

                              case 'fixes':
                                return (
                                  <TableCell key={column.key} className="text-center">
                                    <span className={`text-green-600 font-medium ${(!scanResult || fixCount === 0) ? 'opacity-40' : ''}`}>
                                      {scanResult ? fixCount : 0}
                                    </span>
                                  </TableCell>
                                );

                              case 'status':
                                return (
                                  <TableCell key={column.key}>
                                    {getStatusBadge(scanResult?.status)}
                                  </TableCell>
                                );

                              default:
                                return null;
                            }
                          })}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 bg-white/30 dark:bg-gray-900/10 rounded-xl border border-gray-200 dark:border-gray-800/30">
              <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium mb-2">No Images Found</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                {currentContext
                  ? "No container images were found in the cluster. Try refreshing or check your filters."
                  : "Please select a cluster to view images."
                }
              </p>
            </div>
          )}
        </motion.div>
      </div>

      {/* Column Filter Sidebar */}
      <ResourceFilterSidebar
        isOpen={isFilterSidebarOpen}
        onClose={() => setIsFilterSidebarOpen(false)}
        title="Image Security Columns"
        columns={columnConfig}
        onColumnToggle={handleColumnToggle}
        onColumnReorder={handleColumnReorder}
        onResetToDefault={handleResetToDefault}
        resourceType="image-security"
        offsetTop='top-0'
      />

      {/* Image Vulnerability Drawer */}
      <ImageVulnDrawerSecurity
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        imageInfo={selectedImageInfo}
      />
    </motion.div>
  );
};

export default ImageSecurity;
