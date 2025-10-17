import React, { useState, useEffect, useMemo } from 'react';
import { V1Pod } from '@kubernetes/client-node';
import { SideDrawer, DrawerHeader, DrawerContent } from '@/components/ui/sidedrawer.custom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Shield,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  X,
  ExternalLink,
  Package,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Image,
  ArrowUpRight,
  RotateCcw
} from 'lucide-react';
import { useScan } from '@/contexts/useScan';
import { ScanResult, Vulnerability } from '@/types/vuln';
import { getScanResults } from '@/api/vuln';
import { toast } from '@/hooks/use-toast';
import { openExternalUrl } from '@/api/external';

interface ImageVulnDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  podData: V1Pod | null;
}

/**
 * Component to display image vulnerability scan results in a side drawer
 * @param isOpen Whether the drawer is open
 * @param onClose Function to close the drawer
 * @param podData Pod data containing container images
 */
const ImageVulnDrawer: React.FC<ImageVulnDrawerProps> = ({
  isOpen,
  onClose,
  podData
}) => {
  const { scanResults, scanning, reScanImages } = useScan();
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [imageResults, setImageResults] = useState<ScanResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [copiedItems, setCopiedItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [reloading, setReloading] = useState<boolean>(false);

  // Sorting state
  type SortDirection = 'asc' | 'desc' | null;
  type SortField = 'id' | 'severity' | 'score' | 'package' | 'fix' | null;

  interface SortState {
    field: SortField;
    direction: SortDirection;
  }

  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Extract unique images from pod data
  const podImages = useMemo(() => {
    if (!podData?.spec?.containers) return [];

    const images = new Set<string>();

    // Add container images
    podData.spec.containers.forEach(container => {
      if (container.image) {
        images.add(container.image);
      }
    });

    // Add init container images if any
    podData.spec.initContainers?.forEach(container => {
      if (container.image) {
        images.add(container.image);
      }
    });

    return Array.from(images);
  }, [podData]);

  // Initialize selected images when pod data changes
  useEffect(() => {
    if (podImages.length > 0) {
      setSelectedImages([...podImages]);
    }
  }, [podImages]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch scan results for pod images when drawer opens
  useEffect(() => {
    const fetchImageResults = async () => {
      if (!isOpen || podImages.length === 0) return;

      setLoadingResults(true);
      try {
        const results: ScanResult[] = [];

        for (const image of podImages) {
          try {
            // Use the API directly to get the most up-to-date results
            const result = await getScanResults({ image });
            if (result) {
              results.push(result);
            }
          } catch (err) {
            console.warn(`No scan results found for image: ${image}`, err);
            // Check if we have results in the scan context as fallback
            const existingResult = scanResults.find(result => result.image === image);
            if (existingResult) {
              results.push(existingResult);
            }
          }
        }

        setImageResults(results);
      } catch (err) {
        console.error('Error fetching image scan results:', err);
      } finally {
        setLoadingResults(false);
      }
    };

    fetchImageResults();
  }, [isOpen, podImages, scanResults]);

  /**
   * Toggle image selection for filtering
   * @param image Image name to toggle
   */
  const toggleImageSelection = (image: string) => {
    setSelectedImages(prev => {
      if (prev.includes(image)) {
        return prev.filter(img => img !== image);
      } else {
        return [...prev, image];
      }
    });
  };

  /**
   * Handle re-scanning specific images
   */
  const handleReScan = async () => {
    if (selectedImages.length === 0) {
      toast({
        title: "No Images Selected",
        description: "Please select at least one image to scan",
        variant: "destructive"
      });
      return;
    }

    try {
      await reScanImages(selectedImages);
      // Refresh results after scan
      setTimeout(async () => {
        const results: ScanResult[] = [];
        for (const image of selectedImages) {
          try {
            const result = await getScanResults({ image });
            if (result) {
              results.push(result);
            }
          } catch (err) {
            console.warn(`Failed to refresh scan results for image: ${image}`, err);
          }
        }
        setImageResults(prev => {
          const updated = [...prev];
          results.forEach(newResult => {
            const existingIndex = updated.findIndex(r => r.image === newResult.image);
            if (existingIndex >= 0) {
              updated[existingIndex] = newResult;
            } else {
              updated.push(newResult);
            }
          });
          return updated;
        });
      }, 2000);
    } catch (err) {
      console.error('Error re-scanning images:', err);
    }
  };

  /**
   * Handle reloading scan results
   */
  const handleReload = async () => {
    if (selectedImages.length === 0) {
      toast({
        title: "No Images Selected",
        description: "Please select at least one image to reload",
        variant: "destructive"
      });
      return;
    }

    setReloading(true);
    try {
      const results: ScanResult[] = [];
      for (const image of selectedImages) {
        try {
          const result = await getScanResults({ image });
          if (result) {
            results.push(result);
          }
        } catch (err) {
          console.warn(`Failed to reload scan results for image: ${image}`, err);
        }
      }
      
      setImageResults(prev => {
        const updated = [...prev];
        results.forEach(newResult => {
          const existingIndex = updated.findIndex(r => r.image === newResult.image);
          if (existingIndex >= 0) {
            updated[existingIndex] = newResult;
          } else {
            updated.push(newResult);
          }
        });
        return updated;
      });

      toast({
        title: "Results Reloaded",
        description: `Reloaded scan results for ${results.length} image(s)`
      });
    } catch (err) {
      console.error('Error reloading scan results:', err);
      toast({
        title: "Reload Failed",
        description: "Failed to reload scan results",
        variant: "destructive"
      });
    } finally {
      setReloading(false);
    }
  };

  /**
   * Get severity color for vulnerabilities
   * @param severity Vulnerability severity
   * @returns CSS class string
   */
  const getSeverityColor = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300';
      case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'low': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-400';
    }
  };

  /**
   * Get CVSS score color
   * @param score CVSS score
   * @returns CSS class string
   */
  const getCvssScoreColor = (score: number): string => {
    if (score >= 9.0) return 'text-red-600 dark:text-red-400 font-bold';
    if (score >= 7.0) return 'text-orange-600 dark:text-orange-400 font-medium';
    if (score >= 4.0) return 'text-yellow-600 dark:text-yellow-400 font-medium';
    return 'text-blue-600 dark:text-blue-400';
  };

  /**
   * Handle column sort click
   */
  const handleSort = (field: SortField) => {
    setSort(prevSort => {
      if (prevSort.field === field) {
        if (prevSort.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prevSort.direction === 'desc') {
          return { field: null, direction: null };
        } else {
          return { field, direction: 'asc' };
        }
      }
      return { field, direction: 'asc' };
    });
  };

  /**
   * Render sort indicator
   */
  const renderSortIndicator = (field: SortField) => {
    if (sort.field !== field) {
      return <ArrowUpDown className="ml-1 h-3 w-3 inline opacity-30" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-3 w-3 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-3 w-3 inline text-blue-500" />;
    }

    return null;
  };

  /**
   * Toggle row expansion
   */
  const toggleRowExpansion = (vulnId: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(vulnId)) {
        newSet.delete(vulnId);
      } else {
        newSet.add(vulnId);
      }
      return newSet;
    });
  };

  /**
   * Handle copying text to clipboard
   */
  const handleCopy = async (text: string, itemKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => new Set([...prev, itemKey]));

      // Reset copy state after 2 seconds
      setTimeout(() => {
        setCopiedItems(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemKey);
          return newSet;
        });
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };


  // Filter results based on selected images
  const filteredResults = imageResults.filter(result => selectedImages.includes(result.image));

  // Flatten vulnerabilities from all selected images with sorting and filtering
  const allVulnerabilities = useMemo(() => {
    const vulns: Array<Vulnerability & { imageName: string }> = [];

    filteredResults.forEach(result => {
      if (result.vulnerabilities) {
        result.vulnerabilities.forEach(vuln => {
          vulns.push({ ...vuln, imageName: result.image });
        });
      }
    });

    // Filter by debounced search term
    const filteredVulns = debouncedSearchTerm.trim() 
      ? vulns.filter(vuln => 
          vuln.id.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          vuln.packageName.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          vuln.severity.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
          (vuln.description && vuln.description.toLowerCase().includes(debouncedSearchTerm.toLowerCase()))
        )
      : vulns;

    // Sort vulnerabilities
    if (!sort.field || !sort.direction) {
      return filteredVulns;
    }

    return [...filteredVulns].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'id':
          return a.id.localeCompare(b.id) * sortMultiplier;

        case 'severity': {
          const severityOrder: Record<string, number> = {
            'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1, 'Unknown': 0
          };
          const orderA = severityOrder[a.severity] || 0;
          const orderB = severityOrder[b.severity] || 0;
          return (orderA - orderB) * sortMultiplier;
        }

        case 'score': {
          const scoreA = a.cvssScore ? parseFloat(a.cvssScore.toString()) : -1;
          const scoreB = b.cvssScore ? parseFloat(b.cvssScore.toString()) : -1;
          
          // Handle cases where one or both scores are missing
          if (scoreA === -1 && scoreB === -1) return 0;
          if (scoreA === -1) return 1 * sortMultiplier; // Missing scores go to end
          if (scoreB === -1) return -1 * sortMultiplier; // Missing scores go to end
          
          return (scoreA - scoreB) * sortMultiplier;
        }

        case 'package':
          return a.packageName.localeCompare(b.packageName) * sortMultiplier;

        case 'fix': {
          const fixA = a.fixVersion || '';
          const fixB = b.fixVersion || '';
          return fixA.localeCompare(fixB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredResults, sort.field, sort.direction, debouncedSearchTerm]);

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} offsetTop="-top-2">
      <DrawerHeader onClose={onClose}>
        <div className="py-1">
          <div className="text-xl font-light dark:text-gray-500 mt-1">
            <span className="text-black dark:text-white">{podData?.metadata?.namespace}</span>{" "}{podData?.metadata?.name}
          </div>
        </div>
      </DrawerHeader>

      <DrawerContent>
        <div className="p-2 space-y-4">
          {/* Images Filter Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-xs uppercase text-gray-900 dark:text-gray-500">
                Container Images ({podImages.length})
              </h4>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleReload}
                  disabled={reloading || selectedImages.length === 0}
                  className="h-6 px-2 text-xs"
                  variant="outline"
                >
                  {reloading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={handleReScan}
                  disabled={scanning || selectedImages.length === 0}
                  className="h-6 px-2 text-xs"
                >
                  {scanning ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Shield className="h-3 w-3 mr-1" />
                  )}
                  Re-scan
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {podImages.map((image) => {
                const isSelected = selectedImages.includes(image);
                const result = imageResults.find(r => r.image === image);

                return (
                  <div
                    key={image}
                    className="dark:text-gray-300"
                    onClick={() => toggleImageSelection(image)}
                  >
                    <div className="flex items-center gap-1 dark:text-gray-400 max-w-80 p-1 dark:bg-gray-600/10 rounded-lg">
                      <div className='bg-gray-200/20 dark:bg-gray-500/20 rounded-md p-1'>
                        <Image className='h-4 w-4 dark:text-cyan-600' />
                      </div>
                      <span className="truncate text-sm ">
                        {image}
                      </span>

                      {result && (
                        <span className="text-sm whitespace-nowrap">
                          ({result.summary.total})
                        </span>
                      )}


                      {!isSelected && (
                        <X className="h-3 w-3 ml-1 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>


          {/* Loading State */}
          {(loadingResults || scanning) && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span className="text-sm text-gray-500">
                {scanning ? 'Scanning images...' : 'Loading scan results...'}
              </span>
            </div>
          )}

          {/* Vulnerabilities Table */}
          {!loadingResults && !scanning && allVulnerabilities.length > 0 && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-1 mb-6">
                {(() => {
                  const summary = allVulnerabilities.reduce((acc, vuln) => {
                    switch (vuln.severity.toLowerCase()) {
                      case 'critical': acc.critical++; break;
                      case 'high': acc.high++; break;
                      case 'medium': acc.medium++; break;
                      case 'low': acc.low++; break;
                    }
                    acc.total++;
                    return acc;
                  }, { critical: 0, high: 0, medium: 0, low: 0, total: 0 });

                  return [
                    { label: 'Critical', count: summary.critical, severity: 'critical' },
                    { label: 'High', count: summary.high, severity: 'high' },
                    { label: 'Medium', count: summary.medium, severity: 'medium' },
                    { label: 'Low', count: summary.low, severity: 'low' }
                  ].map(({ label, count, severity }) => (
                    <Card key={label} className="bg-gray-50 dark:bg-transparent rounded-md border border-gray-200 dark:border-gray-800/50 shadow-none min-h-32">
                      <CardContent className="py-2 px-2 flex flex-col h-full">
                        <h2 className="text-sm uppercase font-medium text-gray-800 dark:text-gray-500 mb-auto">{label}</h2>
                        <div className="mt-auto">
                          <p className={`text-5xl font-light mb-1 ${severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                            severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                              severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-blue-600 dark:text-blue-400'
                            }`}>
                            {count}
                          </p>
                          <div className="w-full h-1 bg-gray-200 dark:bg-gray-800/30 rounded-[0.3rem] mt-1">
                            <div className={`h-1 rounded-[0.3rem] ${severity === 'critical' ? 'bg-red-500 dark:bg-red-400' :
                              severity === 'high' ? 'bg-orange-500 dark:bg-orange-400' :
                                severity === 'medium' ? 'bg-yellow-500 dark:bg-yellow-400' :
                                  'bg-blue-500 dark:bg-blue-400'
                              }`} style={{ width: '100%' }}></div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ));
                })()}
              </div>

              {/* Search Input */}
              <div className="mb-4">
                <Input
                  placeholder="Search vulnerabilities (CVE, package, severity, description)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Vulnerabilities Table */}
              <Card className="bg-transparent border border-gray-200 dark:border-gray-800/50">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                      <TableHead className="w-8"></TableHead>
                      <TableHead
                        className="cursor-pointer hover:text-blue-500 w-96"
                        onClick={() => handleSort('id')}
                      >
                        CVE {renderSortIndicator('id')}
                      </TableHead>
                      {/* <TableHead 
                        className="cursor-pointer hover:text-blue-500 w-20"
                        onClick={() => handleSort('severity')}
                      >
                        Severity {renderSortIndicator('severity')}
                      </TableHead> */}
                      <TableHead
                        className="cursor-pointer hover:text-blue-500 w-36 text-center"
                        onClick={() => handleSort('score')}
                      >
                        Score {renderSortIndicator('score')}
                      </TableHead>

                      <TableHead
                        className="cursor-pointer hover:text-blue-500"
                        onClick={() => handleSort('fix')}
                      >
                        Fix Version {renderSortIndicator('fix')}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allVulnerabilities.map((vuln, index) => {
                      const vulnKey = `${vuln.imageName}-${vuln.id}-${vuln.packageName}-${index}`;
                      const isExpanded = expandedRows.has(vulnKey);

                      return (
                        <React.Fragment key={vulnKey}>
                          <TableRow
                            className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                            onClick={() => toggleRowExpansion(vulnKey)}
                          >
                            <TableCell className="w-8">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-500" />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="font-mono text-blue-500 dark:text-blue-400 text-sm">{vuln.id}</div>
                              {vuln.description && (
                                <div>
                                  <p className="text-xs font-light text-gray-700 dark:text-gray-300">{vuln.description.slice(0, 100)} {vuln.description.length > 100 ? "..." : "."}</p>
                                </div>
                              )}
                            </TableCell>
                            {/* <TableCell>
                                {vuln.severity}
                                </TableCell> */}
                            <TableCell className="text-center">
                              {vuln.cvssScore && (
                                <Badge className={getSeverityColor(vuln.severity)}>
                                  <span className={getCvssScoreColor(parseFloat(vuln.cvssScore.toString()))}>
                                    {vuln.cvssScore}
                                  </span>
                                </Badge>
                              )}
                            </TableCell>
                            {/* <TableCell>
                              <div className="flex items-center gap-1">
                                <Package className="h-3 w-3 text-gray-500" />
                                <span className="truncate">{vuln.packageName}</span>
                              </div>
                            </TableCell> */}
                            <TableCell>
                              <span>
                                {vuln.fixVersion || 'Not available'}
                              </span>
                            </TableCell>
                          </TableRow>

                          {/* Expanded Row Details */}
                          {isExpanded && (
                            <TableRow className="bg-gray-100 dark:bg-gray-800/20">
                              <TableCell colSpan={6} className="p-4 dark:hover:bg-transparent">
                                <div className="space-y-4">
                                  {/* Description */}
                                  {vuln.imageName && (
                                    <div className='flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300'>
                                      <Image className='h-4 w-4' />
                                      <p className="">{vuln.imageName}</p>
                                    </div>
                                  )}
                                  {/* Description */}
                                  {vuln.description && (
                                    <div>
                                      <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Description</h6>
                                      <p className="text-sm text-gray-700 dark:text-gray-300">{vuln.description}</p>
                                    </div>
                                  )}

                                  <div className="space-y-4">
                                              {/* CVSS Score Details */}
                                              <div className='border rounded-lg'>
                                      <div className='bg-gray-200 dark:bg-gray-800/60 p-1 text-gray-600 dark:text-gray-400 flex items-center gap-1'>
                                        <Shield className="h-3 w-3" />
                                        <h6 className="text-sm font-medium">Score</h6>
                                      </div>
                                      <div className="space-y-2 text-sm p-1.5">
                                        {/* Severity */}
                                        <div className="flex items-center justify-between group">
                                          <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">Severity</span>
                                          <div className="flex items-center gap-1 min-w-0">
                                            <Badge className={getSeverityColor(vuln.severity)}>
                                              {vuln.severity}
                                            </Badge>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopy(vuln.severity, `${vulnKey}-severity`);
                                              }}
                                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                            >
                                              {copiedItems.has(`${vulnKey}-severity`) ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                              ) : (
                                                <Copy className="h-3 w-3 text-gray-500" />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* CVSS Score */}
                                        {vuln.cvssScore && (
                                          <div className="flex items-center justify-between group">
                                            <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">Score</span>
                                            <div className="flex items-center gap-1 min-w-0">
                                              <Badge className={getSeverityColor(vuln.severity)}>
                                                <span className={getCvssScoreColor(parseFloat(vuln.cvssScore.toString()))}>
                                                  {vuln.cvssScore}
                                                </span>
                                              </Badge>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCopy(vuln.cvssScore?.toString() || '', `${vulnKey}-score`);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                              >
                                                {copiedItems.has(`${vulnKey}-score`) ? (
                                                  <Check className="h-3 w-3 text-green-500" />
                                                ) : (
                                                  <Copy className="h-3 w-3 text-gray-500" />
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* CVSS Vector */}
                                        {vuln.cvssVector && (
                                          <div className="flex items-center justify-between group">
                                            <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">Vector</span>
                                            <div className="flex items-center gap-1 min-w-0">
                                              <span className="truncate font-mono text-xs max-w-56">{vuln.cvssVector}</span>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCopy(vuln.cvssVector || '', `${vulnKey}-vector`);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                              >
                                                {copiedItems.has(`${vulnKey}-vector`) ? (
                                                  <Check className="h-3 w-3 text-green-500" />
                                                ) : (
                                                  <Copy className="h-3 w-3 text-gray-500" />
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        )}

                                        {/* Modified Date */}
                                        {vuln.lastModifiedDate && (
                                          <div className="flex items-center justify-between group">
                                            <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">Modified</span>
                                            <div className="flex items-center gap-1 min-w-0">
                                              <span className="truncate font-mono text-xs">{new Date(vuln.lastModifiedDate).toLocaleDateString()}</span>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCopy(vuln.lastModifiedDate ? new Date(vuln.lastModifiedDate).toLocaleDateString() : '', `${vulnKey}-modified`);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                              >
                                                {copiedItems.has(`${vulnKey}-modified`) ? (
                                                  <Check className="h-3 w-3 text-green-500" />
                                                ) : (
                                                  <Copy className="h-3 w-3 text-gray-500" />
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {/* Package Details */}
                                    <div className='border rounded-lg'>
                                      <div className='bg-gray-200 dark:bg-gray-800/60 p-1 text-gray-600 dark:text-gray-400 flex items-center gap-1'>
                                        <Package className="h-3 w-3" />
                                        <h6 className="text-sm font-medium ">Package</h6>
                                      </div>
                                      <div className="space-y-2 text-sm p-1.5">
                                        {/* Version */}
                                        <div className="flex items-center justify-between group">
                                          <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">Version</span>
                                          <div className="flex items-center gap-1 min-w-0">
                                            <span className="truncate font-mono text-xs">{vuln.version}</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopy(vuln.version, `${vulnKey}-version`);
                                              }}
                                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                            >
                                              {copiedItems.has(`${vulnKey}-version`) ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                              ) : (
                                                <Copy className="h-3 w-3 text-gray-500" />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Type */}
                                        <div className="flex items-center justify-between group">
                                          <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">Type</span>
                                          <div className="flex items-center gap-1 min-w-0">
                                            <span className="truncate font-mono text-xs">{vuln.packageType}</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopy(vuln.packageType, `${vulnKey}-type`);
                                              }}
                                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                            >
                                              {copiedItems.has(`${vulnKey}-type`) ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                              ) : (
                                                <Copy className="h-3 w-3 text-gray-500" />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Package Name */}
                                        <div className="flex items-center justify-between group">
                                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400 flex-shrink-0">

                                            <span>Name</span>
                                          </div>
                                          <div className="flex items-center gap-1 min-w-0">
                                            <span className="truncate font-mono text-xs">{vuln.packageName}</span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleCopy(vuln.packageName, `${vulnKey}-name`);
                                              }}
                                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                            >
                                              {copiedItems.has(`${vulnKey}-name`) ? (
                                                <Check className="h-3 w-3 text-green-500" />
                                              ) : (
                                                <Copy className="h-3 w-3 text-gray-500" />
                                              )}
                                            </button>
                                          </div>
                                        </div>

                                        {/* Location */}
                                        {vuln.locations && vuln.locations.length > 0 && (
                                          <div className="flex items-center justify-between group">
                                            <span className="text-gray-600 dark:text-gray-400 flex-shrink-0">Location</span>
                                            <div className="flex items-center gap-1 min-w-0">
                                              <span className="truncate font-mono text-xs max-w-56">{vuln.locations?.[0]?.path}</span>
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleCopy(vuln.locations?.[0]?.path || '', `${vulnKey}-location`);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
                                              >
                                                {copiedItems.has(`${vulnKey}-location`) ? (
                                                  <Check className="h-3 w-3 text-green-500" />
                                                ) : (
                                                  <Copy className="h-3 w-3 text-gray-500" />
                                                )}
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>                          
                                  </div>




                                  {/* URLs and Actions */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-1">
                                    {/* References */}
                                    {vuln.urls && vuln.urls.length > 0 && (
                                      <div>
                                        <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">References</h6>
                                        <div className="space-y-1">
                                          {vuln.urls.map((url, urlIndex) => (
                                            <button
                                              key={urlIndex}
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                openExternalUrl(url);
                                              }}
                                              className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline text-left"
                                            >
                                              <ArrowUpRight className="h-3 w-3" />
                                              {url}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Data Source */}
                                    {vuln.dataSource && (
                                      <div className='px-1'>
                                        <h6 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Data Source</h6>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openExternalUrl(vuln.dataSource as string);
                                          }}
                                          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline text-left"
                                        >
                                          <ArrowUpRight className="h-3 w-3" />
                                          {vuln.dataSource}
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}

          {/* No Results State */}
          {!loadingResults && !scanning && allVulnerabilities.length === 0 && selectedImages.length > 0 && (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No vulnerabilities found</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Selected images appear to be secure
              </p>
            </div>
          )}

          {/* No Scan Results State */}
          {!loadingResults && !scanning && filteredResults.length === 0 && selectedImages.length > 0 && (
            <div className="text-center py-8">
              <Shield className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No scan results available</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Click Re-scan to scan the selected images
              </p>
            </div>
          )}

          {/* No Images Selected State */}
          {selectedImages.length === 0 && (
            <div className="text-center py-8">
              <Eye className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">No images selected</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Select images above to view their scan results
              </p>
            </div>
          )}
        </div>
      </DrawerContent>
    </SideDrawer>
  );
};

export default ImageVulnDrawer;