import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Search, ExternalLink, Package, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { debounce } from 'lodash';
import { HelmChartDialog } from '@/components/custom';
import { ArtifactHubChart } from '@/types/helm';
import { openExternalUrl } from '@/api/external';

interface ArtifactHubResponse {
  packages: ArtifactHubChart[];
  facets: any[];
  metadata?: {
    total: number;
  };
}

const HelmCharts: React.FC = () => {
  const navigate = useNavigate();
  const [charts, setCharts] = useState<ArtifactHubChart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedChart, setSelectedChart] = useState<ArtifactHubChart | null>(null);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();

        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle input change with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    debouncedSearch(e.target.value);
  };

  // Create a debounced function
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setDebouncedQuery(query);
    }, 500), // 500ms debounce delay
    []
  );

  // Fetch helm charts from Artifact Hub
  useEffect(() => {
    const fetchHelmCharts = async () => {
      try {
        setLoading(true);

        // Create the search URL with the query parameter
        const searchUrl = new URL('https://artifacthub.io/api/v1/packages/search');
        searchUrl.searchParams.append('offset', '0');
        searchUrl.searchParams.append('limit', '20');
        searchUrl.searchParams.append('facets', 'true');
        searchUrl.searchParams.append('kind', '0');
        searchUrl.searchParams.append('ts_query_web', debouncedQuery); // Use debounced query
        searchUrl.searchParams.append('sort', 'relevance');
        searchUrl.searchParams.append('deprecated', 'false');
        // searchUrl.searchParams.append('verified_publisher', 'true');

        const response = await fetch(searchUrl.toString(), {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Kubernetes Explorer)'
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch Helm charts: ${response.status}`);
        }

        const data: ArtifactHubResponse = await response.json();
        setCharts(data.packages);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch Helm charts:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch Helm charts');
      } finally {
        setLoading(false);
      }
    };

    fetchHelmCharts();
  }, [debouncedQuery]); // Use debouncedQuery instead of searchQuery

  // Filter charts based on search query
  const filteredCharts = useMemo(() => {
    // Since we're already filtering via API, we could just return the charts
    // But keeping local filtering as a backup or for further refinement
    return charts;
  }, [charts]);

  const handleChartDetails = (chart: ArtifactHubChart) => {
    setSelectedChart(chart);
    setIsDialogOpen(true);
  };

  // Format relative time from timestamp
  const formatRelativeTime = (timestamp: number) => {
    if (!timestamp) return 'Unknown';

    try {
      const now = Math.floor(Date.now() / 1000);
      const secondsAgo = now - timestamp;

      if (secondsAgo < 60) return 'just now';
      if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
      if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
      if (secondsAgo < 2592000) return `${Math.floor(secondsAgo / 86400)}d ago`;
      if (secondsAgo < 31536000) return `${Math.floor(secondsAgo / 2592000)}mo ago`;
      return `${Math.floor(secondsAgo / 31536000)}y ago`;
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return 'Unknown';
    }
  };

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 items-start md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Helm Charts</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, repository, or description..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-96">
          <p className="text-sm text-gray-500 dark:text-gray-400">Discover and install Helm charts from Artifact Hub</p>
        </div>
      </div>

      {/* Loading indicator */}
      {loading && (
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        </div>
      )}

      {/* Error message */}
      {!loading && error && (
        <Alert className="m-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* No results message */}
      {!loading && !error && filteredCharts.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No Helm charts matching "${searchQuery}"`
              : "No Helm charts found"}
          </AlertDescription>
        </Alert>
      )}

      {/* Helm charts table */}
      {!loading && !error && filteredCharts.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            <HelmChartDialog
              chart={selectedChart}
              isOpen={isDialogOpen}
              onClose={() => setIsDialogOpen(false)}
            />
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-300 dark:border-gray-800/80">
                  <TableHead>Name</TableHead>
                  <TableHead>Repository</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-center">Version</TableHead>
                  <TableHead className="text-center">App Version</TableHead>
                  <TableHead className="text-center">Age</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCharts.map((chart) => (
                  <TableRow
                    key={chart.package_id}
                    className="bg-gray-50 dark:bg-transparent border-b border-gray-200 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                    onClick={() => handleChartDetails(chart)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center space-x-2">
                        {chart.logo_image_id ? (
                          <img
                            src={`https://artifacthub.io/image/${chart.logo_image_id}`}
                            alt={`${chart.name} logo`}
                            className="w-6 h-6 rounded"
                          />
                        ) : (
                          <Package className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        )}
                        <div className="hover:text-blue-500 hover:underline">
                          {chart.display_name || chart.name}
                        </div>
                        {chart.repository.verified_publisher && (
                          <span className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 text-xs px-1.5 py-0.5 rounded-full">
                            Verified
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {chart.repository.display_name || chart.repository.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-600 dark:text-gray-400 max-w-md truncate">
                        {chart.description}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-sm">
                        {chart.version}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="text-sm">
                        {chart.app_version || '-'}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {formatRelativeTime(chart.ts)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {chart.stars > 0 && (
                          <div className="flex items-center text-amber-500 dark:text-amber-400 text-xs">
                            <Star className="h-3 w-3 inline mr-0.5" />
                            {chart.stars}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            openExternalUrl(`https://artifacthub.io/packages/helm/${chart.repository.name}/${chart.name}`);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default HelmCharts;