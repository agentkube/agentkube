import React, { useEffect } from 'react';
import { Shield, ShieldCheck, Loader2, Image, AlertTriangle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { useScan } from '@/contexts/useScan';
import { useCluster } from '@/contexts/clusterContext';

interface VulnScanFooterToolProps {
  className?: string;
}

const VulnScanFooterTool: React.FC<VulnScanFooterToolProps> = ({ className }) => {
  const { clusterImages, scanResults, loading, scanning, fetchClusterImages, reScan } = useScan();
  const { currentContext } = useCluster();

  // Get unique image count
  const uniqueImages = [...new Set(clusterImages.map(img => img.image))];
  const imageCount = uniqueImages.length;

  // Get scan results count
  const scannedImages = scanResults.length;
  const hasVulns = scanResults.some(result => result.summary.total > 0);

  const handleScanCluster = async () => {
    if (!currentContext) return;
    
    // First fetch images to know what we're working with
    if (clusterImages.length === 0) {
      await fetchClusterImages();
    }
    
    // Then trigger scan
    await reScan();
  };

  const getIconAndColor = () => {
    if (loading || scanning) {
      return { icon: Loader2, color: 'text-blue-400', extraClass: 'animate-spin' };
    }
    
    if (scannedImages > 0 && hasVulns) {
      return { icon: AlertTriangle, color: 'text-red-400', extraClass: '' };
    }
    
    if (scannedImages > 0 && !hasVulns) {
      return { icon: ShieldCheck, color: 'text-green-400', extraClass: '' };
    }
    
    return { icon: Image, color: 'text-gray-400', extraClass: '' };
  };

  const { icon: IconComponent, color, extraClass } = getIconAndColor();

  // Fetch cluster images when component mounts or cluster changes
  useEffect(() => {
    if (currentContext && clusterImages.length === 0 && !loading) {
      fetchClusterImages();
    }
  }, [currentContext, clusterImages.length, loading, fetchClusterImages]);

  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center relative text-gray-400/80 backdrop-blur-md hover:text-blue-500 cursor-pointer group hover:bg-gray-100/10 p-1 ${className}`}
              >
                <IconComponent className={`h-[0.8rem] ${color} ${extraClass}`} />
                {/* {imageCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 text-white text-[8px] rounded-full flex items-center justify-center">
                  </span>
                )} */}
                {imageCount > 15 ? '15+' : imageCount} Images
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent className="bg-white dark:bg-[#0B0D13]/60 backdrop-blur-md p-1 text-gray-900 dark:text-gray-100">
            <p>Vulnerability Scanner {imageCount > 0 && `(${imageCount} images)`}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DropdownMenuContent
        className="w-80 bg-white dark:bg-[#0B0D13]/40 backdrop-blur-md border-gray-200 rounded-lg dark:border-neutral-600/30"
        align="end"
        sideOffset={5}
      >
        <div className="flex items-center justify-between bg-gray-300/50 dark:bg-gray-300/10 backdrop-blur-md">
          <DropdownMenuLabel className="flex items-center gap-1 text-sm font-light text-gray-900 dark:text-gray-100">
            {/* <Shield className='h-4 w-4' /> */}
            Image Vulnerability Scanner
          </DropdownMenuLabel>
        </div>

      
        <div className="p-4 space-y-4">
          {/* Cluster Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Cluster</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {currentContext?.name || 'No cluster selected'}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Images</span>
              <div className="flex items-center gap-1">
                <Image className="h-3 w-3 text-gray-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {imageCount}
                </span>
              </div>
            </div>

            {scannedImages > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Scanned</span>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {scannedImages}
                </span>
              </div>
            )}

            {scannedImages > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
                <div className="flex items-center gap-1">
                  {hasVulns ? (
                    <>
                      <AlertTriangle className="h-3 w-3 text-red-400" />
                      <span className="text-sm text-red-400">Vulnerabilities found</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-3 w-3 text-green-400" />
                      <span className="text-sm text-green-400">Clean</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action Button */}
          <Button
            onClick={handleScanCluster}
            disabled={loading || scanning || !currentContext}
            className="flex justify-between w-full bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
          >
            {loading || scanning ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                {scanning ? 'Scanning...' : 'Loading...'}
              </>
            ) : scannedImages > 0 ? (
              <>
                <Shield className="h-3 w-3 mr-2" />
                Re-scan Cluster
              </>
            ) : (
              <>
                <Shield className="h-3 w-3 mr-2" />
                Scan Cluster 
              </>
            )}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default VulnScanFooterTool;