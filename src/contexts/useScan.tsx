import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { getClusterImages, scanImages, getScanResults } from '@/api/vuln';
import { 
  ClusterImagesResponse, 
  ScanImagesResponse, 
  ScanResult, 
  ImageInfo 
} from '@/types/vuln';
import { useCluster } from './clusterContext';
import { useToast } from '@/hooks/use-toast';

interface ScanContextType {
  clusterImages: ImageInfo[];
  scanResults: ScanResult[];
  loading: boolean;
  scanning: boolean;
  error: string | null;
  fetchClusterImages: () => Promise<void>;
  scanClusterImages: () => Promise<void>;
  reScan: () => Promise<void>;
  reScanImages: (images: string[]) => Promise<void>;
  getScanResultForImage: (image: string) => Promise<ScanResult | null>;
}

const ScanContext = createContext<ScanContextType | undefined>(undefined);

interface ScanProviderProps {
  children: ReactNode;
}

export const ScanProvider: React.FC<ScanProviderProps> = ({ children }) => {
  const [clusterImages, setClusterImages] = useState<ImageInfo[]>([]);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { currentContext } = useCluster();
  const { toast } = useToast();

  /**
   * Fetch all images from the current cluster
   */
  const fetchClusterImages = useCallback(async () => {
    if (!currentContext) return;

    try {
      setLoading(true);
      setError(null);

      const response: ClusterImagesResponse = await getClusterImages(currentContext.name);
      setClusterImages(response.images);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch cluster images';
      setError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentContext, toast]);

  /**
   * Scan all images found in the current cluster
   */
  const scanClusterImages = useCallback(async () => {
    if (!currentContext || clusterImages.length === 0) return;

    try {
      setScanning(true);
      setError(null);

      // Extract unique image names from cluster images
      const imageNames = [...new Set(clusterImages.map(img => img.image))];

      const response: ScanImagesResponse = await scanImages({
        images: imageNames
      });

      if (response.success) {
        setScanResults(response.results);
        // toast({
        //   title: "Scan Completed",
        //   description: `Successfully scanned ${imageNames.length} images`,
        // });
      } else {
        throw new Error(response.message || 'Scan failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to scan cluster images';
      setError(errorMessage);
      toast({
        title: "Scan Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  }, [currentContext, clusterImages, toast]);

  /**
   * Re-scan the current cluster (fetch images then scan them)
   */
  const reScan = useCallback(async () => {
    if (!currentContext) return;

    try {
      setLoading(true);
      setScanning(true);
      setError(null);

      // First fetch the latest images
      const response: ClusterImagesResponse = await getClusterImages(currentContext.name);
      setClusterImages(response.images);

      // Then scan all the images
      const imageNames = [...new Set(response.images.map(img => img.image))];
      
      if (imageNames.length > 0) {
        const scanResponse: ScanImagesResponse = await scanImages({
          images: imageNames
        });

        if (scanResponse.success) {
          setScanResults(scanResponse.results);
          toast({
            title: "Re-scan Completed",
            description: `Re-scanned ${imageNames.length} images in cluster ${currentContext.name}`,
          });
        } else {
          throw new Error(scanResponse.message || 'Re-scan failed');
        }
      } else {
        toast({
          title: "No Images Found",
          description: `No images found to scan in cluster ${currentContext.name}`,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to re-scan cluster';
      setError(errorMessage);
      toast({
        title: "Re-scan Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, [currentContext, toast]);

  /**
   * Re-scan specific images only
   * @param images Array of image names to scan
   */
  const reScanImages = useCallback(async (images: string[]) => {
    if (images.length === 0) return;

    try {
      setScanning(true);
      setError(null);

      const response: ScanImagesResponse = await scanImages({
        images: images
      });

      if (response.success) {
        // Update scan results by merging with existing results
        setScanResults(prevResults => {
          const updatedResults = [...prevResults];
          
          // Replace or add new scan results for the rescanned images
          response.results.forEach(newResult => {
            const existingIndex = updatedResults.findIndex(r => r.image === newResult.image);
            if (existingIndex >= 0) {
              updatedResults[existingIndex] = newResult;
            } else {
              updatedResults.push(newResult);
            }
          });
          
          return updatedResults;
        });

        toast({
          title: "Re-scan Completed",
          description: `Successfully re-scanned ${images.length} images`,
        });
      } else {
        throw new Error(response.message || 'Re-scan failed');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to re-scan images';
      setError(errorMessage);
      toast({
        title: "Re-scan Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  }, [toast]);

  /**
   * Get scan results for a specific image
   * @param image The image name to get results for
   * @returns Promise resolving to scan result or null if not found
   */
  const getScanResultForImage = useCallback(async (image: string): Promise<ScanResult | null> => {
    try {
      const result = await getScanResults({ image });
      return result;
    } catch (err) {
      console.error(`Failed to get scan results for image ${image}:`, err);
      return null;
    }
  }, []);

  // Clear scan data when cluster context changes (but don't auto-fetch)
  useEffect(() => {
    if (currentContext) {
      // Clear previous scan results when switching clusters
      setClusterImages([]);
      setScanResults([]);
      setError(null);
    }
  }, [currentContext]);

  const value = {
    clusterImages,
    scanResults,
    loading,
    scanning,
    error,
    fetchClusterImages,
    scanClusterImages,
    reScan,
    reScanImages,
    getScanResultForImage,
  };

  return (
    <ScanContext.Provider value={value}>
      {children}
    </ScanContext.Provider>
  );
};

export const useScan = () => {
  const context = useContext(ScanContext);
  if (context === undefined) {
    throw new Error('useScan must be used within a ScanProvider');
  }
  return context;
};