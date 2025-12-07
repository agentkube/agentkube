import React, { useState, useEffect, useMemo } from 'react';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
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

interface ImageVulnAuditProps {
  resourceData: K8sResourceData;
}

export const ImageVulnAudit: React.FC<ImageVulnAuditProps> = ({ resourceData }) => {
  const { scanResults, scanning, reScanImages } = useScan();
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

  // Extract images from resource data
  const resourceImages = useMemo(() => {
    const images = new Set<string>();

    // Handle different resource types
    if (resourceData.resourceType === 'image' && resourceData.image) {
      images.add(resourceData.image);
    } else if (resourceData.resourceType === 'pods') {
      // For pods, try to extract from container info
      const status = resourceData.status as Record<string, any>;
      const containerStatuses = status?.containerStatuses as any[] | undefined;

      if (containerStatuses) {
        containerStatuses.forEach(container => {
          if (container.image) {
            images.add(container.image);
          }
        });
      }
    }

    return Array.from(images);
  }, [resourceData]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch scan results for resource images
  useEffect(() => {
    const fetchImageResults = async () => {
      if (resourceImages.length === 0) return;

      setLoadingResults(true);
      try {
        const results: ScanResult[] = [];

        for (const image of resourceImages) {
          try {
            const result = await getScanResults({ image });
            if (result) {
              results.push(result);
            }
          } catch (err) {
            console.warn(`No scan results found for image: ${image}`, err);
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
  }, [resourceImages, scanResults]);

  const handleReScan = async () => {
    if (resourceImages.length === 0) {
      toast({
        title: "No Images Found",
        description: "No images to scan for this resource",
        variant: "destructive"
      });
      return;
    }

    try {
      await reScanImages(resourceImages);
      setTimeout(async () => {
        const results: ScanResult[] = [];
        for (const image of resourceImages) {
          try {
            const result = await getScanResults({ image });
            if (result) {
              results.push(result);
            }
          } catch (err) {
            console.warn(`Failed to refresh scan results for image: ${image}`, err);
          }
        }
        setImageResults(results);
      }, 2000);
    } catch (err) {
      console.error('Error re-scanning images:', err);
    }
  };

  const handleReload = async () => {
    if (resourceImages.length === 0) {
      toast({
        title: "No Images Found",
        description: "No images to reload for this resource",
        variant: "destructive"
      });
      return;
    }

    setReloading(true);
    try {
      const results: ScanResult[] = [];
      for (const image of resourceImages) {
        try {
          const result = await getScanResults({ image });
          if (result) {
            results.push(result);
          }
        } catch (err) {
          console.warn(`Failed to reload scan results for image: ${image}`, err);
        }
      }

      setImageResults(results);

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

  const getSeverityColor = (severity: string): string => {
    switch (severity.toLowerCase()) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-blue-100 text-blue-800';
      default: return 'bg-secondary text-muted-foreground';
    }
  };

  const getCvssScoreColor = (score: number): string => {
    if (score >= 9.0) return 'text-red-600 font-bold';
    if (score >= 7.0) return 'text-orange-600 font-medium';
    if (score >= 4.0) return 'text-yellow-600 font-medium';
    return 'text-blue-600';
  };

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

  const handleCopy = async (text: string, itemKey: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItems(prev => new Set([...prev, itemKey]));

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

  // Flatten vulnerabilities from all images with sorting and filtering
  const allVulnerabilities = useMemo(() => {
    const vulns: Array<Vulnerability & { imageName: string }> = [];

    imageResults.forEach(result => {
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

          if (scoreA === -1 && scoreB === -1) return 0;
          if (scoreA === -1) return 1 * sortMultiplier;
          if (scoreB === -1) return -1 * sortMultiplier;

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
  }, [imageResults, sort.field, sort.direction, debouncedSearchTerm]);

  return (
    <div className="space-y-4">
      {/* Images Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-xs uppercase text-muted-foreground">
            Container Images ({resourceImages.length})
          </h4>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleReload}
              disabled={reloading || resourceImages.length === 0}
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
              disabled={scanning || resourceImages.length === 0}
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
          {resourceImages.map((image) => {
            const result = imageResults.find(r => r.image === image);

            return (
              <div
                key={image}
                className="text-foreground"
              >
                <div className="flex items-center gap-1 text-muted-foreground max-w-80 p-1 bg-secondary rounded-lg">
                  <div className='bg-secondary rounded-md p-1'>
                    <Image className='h-4 w-4 text-cyan-600' />
                  </div>
                  <span className="truncate text-sm">
                    {image}
                  </span>

                  {result && (
                    <span className="text-sm whitespace-nowrap">
                      ({result.summary.total})
                    </span>
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
                <Card key={label} className="bg-card rounded-md border border-border shadow-none min-h-32">
                  <CardContent className="py-2 px-2 flex flex-col h-full">
                    <h2 className="text-sm uppercase font-medium text-muted-foreground mb-auto">{label}</h2>
                    <div className="mt-auto">
                      <p className={`text-5xl font-light mb-1 ${severity === 'critical' ? 'text-red-600 dark:text-red-400' :
                        severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                          severity === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                            'text-blue-600'
                        }`}>
                        {count}
                      </p>
                      <div className="w-full h-1 bg-secondary rounded-[0.3rem] mt-1">
                        <div className={`h-1 rounded-[0.3rem] ${severity === 'critical' ? 'bg-red-500' :
                          severity === 'high' ? 'bg-orange-500' :
                            severity === 'medium' ? 'bg-yellow-500' :
                              'bg-blue-500'
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
          <Card className="bg-transparent border border-border">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border">
                  <TableHead className="w-8"></TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500 w-96"
                    onClick={() => handleSort('id')}
                  >
                    CVE {renderSortIndicator('id')}
                  </TableHead>
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
                        className="bg-card border-b border-border hover:cursor-pointer hover:bg-accent-hover"
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
                          <div className="font-mono text-blue-500 text-sm">{vuln.id}</div>
                          {vuln.description && (
                            <div>
                              <p className="text-xs font-light text-foreground">{vuln.description.slice(0, 100)} {vuln.description.length > 100 ? "..." : "."}</p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {vuln.cvssScore && (
                            <Badge className={getSeverityColor(vuln.severity)}>
                              <span className={getCvssScoreColor(parseFloat(vuln.cvssScore.toString()))}>
                                {vuln.cvssScore}
                              </span>
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span>
                            {vuln.fixVersion || 'Not available'}
                          </span>
                        </TableCell>
                      </TableRow>

                      {/* Expanded Row Details */}
                      {isExpanded && (
                        <TableRow className="bg-secondary">
                          <TableCell colSpan={6} className="p-4 dark:hover:bg-transparent">
                            <div className="space-y-4">
                              {/* Image info */}
                              {vuln.imageName && (
                                <div className='flex items-center gap-1 text-sm text-foreground'>
                                  <Image className='h-4 w-4' />
                                  <p className="">{vuln.imageName}</p>
                                </div>
                              )}

                              {/* Description */}
                              {vuln.description && (
                                <div>
                                  <h6 className="text-xs font-medium text-muted-foreground mb-2">Description</h6>
                                  <p className="text-sm text-foreground">{vuln.description}</p>
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
                                      <span className="text-muted-foreground flex-shrink-0">Severity</span>
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
                                        <span className="text-muted-foreground flex-shrink-0">Score</span>
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
                                        <span className="text-muted-foreground flex-shrink-0">Vector</span>
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
                                        <span className="text-muted-foreground flex-shrink-0">Modified</span>
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
                                      <span className="text-muted-foreground flex-shrink-0">Version</span>
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
                                      <span className="text-muted-foreground flex-shrink-0">Type</span>
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
                                      <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
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
                                        <span className="text-muted-foreground flex-shrink-0">Location</span>
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
                                    <h6 className="text-xs font-medium text-muted-foreground mb-2">References</h6>
                                    <div className="space-y-1">
                                      {vuln.urls.map((url, urlIndex) => (
                                        <button
                                          key={urlIndex}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openExternalUrl(url);
                                          }}
                                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline text-left"
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
                                    <h6 className="text-xs font-medium text-muted-foreground mb-2">Data Source</h6>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openExternalUrl(vuln.dataSource as string);
                                      }}
                                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline text-left"
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
                      )
                      }
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </div >
      )
      }

      {/* No Results State */}
      {
        !loadingResults && !scanning && allVulnerabilities.length === 0 && resourceImages.length > 0 && (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No vulnerabilities found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Selected images appear to be secure
            </p>
          </div>
        )
      }

      {/* No Images State */}
      {
        resourceImages.length === 0 && (
          <div className="text-center py-8">
            <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No images found</p>
            <p className="text-xs text-muted-foreground mt-1">
              No container images found for this resource
            </p>
          </div>
        )
      }
    </div >
  );
};