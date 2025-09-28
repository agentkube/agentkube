/**
 * Scanner Status Response
 */
export interface ScannerStatusResponse {
  status: {
    available: boolean;
    initialized: boolean;
  };
  message?: string;
}

/**
 * Image Information
 */
export interface ImageInfo {
  name: string;
  namespace: string;
  podName: string;
  container: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  image: string;
  imageId: string;
}

/**
 * Cluster Images Response
 */
export interface ClusterImagesResponse {
  cluster: string;
  namespace: string;
  images: ImageInfo[];
  count: number;
}

/**
 * Vulnerability Location
 */
export interface VulnerabilityLocation {
  path: string;
  layerID?: string;
}

/**
 * Related Vulnerability
 */
export interface RelatedVulnerability {
  id: string;
  namespace?: string;
}

/**
 * Enhanced Vulnerability Object
 */
export interface Vulnerability {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Low" | "Unknown";
  packageName: string;
  version: string;
  fixVersion: string;
  packageType: string;
  dataSource?: string;
  description?: string;
  publishedDate?: string;
  lastModifiedDate?: string;
  cvssScore?: number;
  cvssVector?: string;
  cweIds?: string[];
  namespace?: string;
  purl?: string;
  urls?: string[];
  locations?: VulnerabilityLocation[];
  relatedVulnerabilities?: RelatedVulnerability[];
}

/**
 * Vulnerability Summary
 */
export interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  unknown: number;
  total: number;
}

/**
 * Scan Result
 */
export interface ScanResult {
  image: string;
  vulnerabilities?: Vulnerability[];
  summary: VulnerabilitySummary;
  scanTime: string;
  status: "in_progress" | "completed" | "failed";
}

/**
 * Scan Images Request
 */
export interface ScanImagesRequest {
  images: string[];
  namespace?: string;
  labels?: Record<string, string>;
}

/**
 * Cluster Scan Request
 */
export interface ClusterScanRequest {
  namespace?: string;
  resourceType?: string;
  labels?: Record<string, string>;
}

/**
 * Scan Images Response
 */
export interface ScanImagesResponse {
  success: boolean;
  message: string;
  results: ScanResult[];
  errors: string[] | null;
}

/**
 * Get Scan Results Response
 */
export interface GetScanResultsResponse extends ScanResult {}

/**
 * List All Scans Response
 */
export interface ListAllScansResponse {
  results: ScanResult[];
  total: number;
}

/**
 * Error Response
 */
export interface ErrorResponse {
  error: string;
}

/**
 * Query Parameters for getting cluster images
 */
export interface GetClusterImagesParams {
  namespace?: string;
}

/**
 * Query Parameters for getting scan results
 */
export interface GetScanResultsParams {
  image: string;
}

/**
 * Query Parameters for listing all scans
 */
export interface ListAllScansParams {
  severity?: "Critical" | "High" | "Medium" | "Low" | "Unknown";
}