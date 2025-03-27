// api/scanner/security.ts
import { ImageSecurityReport } from "@/types/scanner/image-security-report";
import { MisconfigurationReport } from "@/types/scanner/misconfiguration-report";
import { ClusterComplianceReport, ComplianceReportsApiResponse, VulnerabilityReportItem, VulnerabilityReportsApiResponse } from "@/types/scanner/vulnerability-report";

interface ScanConfigRequest {
  manifest: string;
}

export const scanConfig = async (
  manifest: string
): Promise<MisconfigurationReport> => {
  const response = await fetch("/v2/security/scan/config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      manifest: manifest
    } as ScanConfigRequest)
  });

  if (!response.ok) {
    throw new Error(`Failed to scan configuration: ${response.statusText}`);
  }

  return response.json();
};

// Scan image function
export const scanImage = async (
  image: string
): Promise<ImageSecurityReport> => {
  const response = await fetch("/v2/security/scan/image", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: image
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to scan image: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Gets vulnerability reports from Trivy for a specific cluster
 * @param clusterName The name of the cluster to get vulnerability reports for
 * @returns Promise resolving to vulnerability report 
 */
export const getVulnerabilityReports = async (
  clusterName: string
): Promise<VulnerabilityReportsApiResponse> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/trivy/vulnerabilities`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch vulnerability reports: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Gets compliance reports from Trivy for a specific cluster
 * @param clusterName The name of the cluster to get compliance reports for
 * @returns Promise resolving to cluster compliance reports
 */
export const getClusterComplianceReports = async (
  clusterName: string
): Promise<ComplianceReportsApiResponse> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/trivy/compliance`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch compliance reports: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Gets detailed compliance information for a specific compliance standard
 * @param clusterName The name of the cluster
 * @param reportName The name of the compliance standard/report
 * @returns Promise resolving to detailed compliance report
 */
export const getComplianceDetails = async (
  clusterName: string,
  reportName: string
): Promise<any> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/trivy/compliance/${reportName}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch compliance details: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Gets configuration audit reports from Trivy for a specific cluster
 * @param clusterName The name of the cluster to get config audit reports for
 * @returns Promise resolving to configuration audit reports
 */
export const getConfigAuditReports = async (
  clusterName: string
): Promise<any> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/trivy/config-audit`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch configuration audit reports: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Gets the installation status of Trivy in a cluster
 * @param clusterName The name of the cluster to check Trivy status
 * @returns Promise resolving to Trivy status information
 */
export const getTrivyStatus = async (
  clusterName: string
): Promise<any> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/trivy/status`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Trivy status: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Installs Trivy operator in the cluster
 * @param clusterName The name of the cluster to install Trivy in
 * @returns Promise resolving to installation result
 */
export const installTrivyOperator = async (
  clusterName: string
): Promise<any> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/trivy/install`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    throw new Error(`Failed to install Trivy operator: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Uninstalls Trivy operator from the cluster
 * @param clusterName The name of the cluster to uninstall Trivy from
 * @returns Promise resolving to uninstallation result
 */
export const uninstallTrivyOperator = async (
  clusterName: string
): Promise<any> => {
  const response = await fetch(`http://localhost:4688/api/v1/cluster/${clusterName}/trivy/uninstall`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for auth
  });

  if (!response.ok) {
    throw new Error(`Failed to uninstall Trivy operator: ${response.statusText}`);
  }

  return response.json();
};

type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE' | 'UNKNOWN';

// Define the colors object with the correct type
const colors: Record<SeverityLevel, string> = {
    CRITICAL: '#dc2626',
    HIGH: '#ea580c',
    MEDIUM: '#ca8a04',
    LOW: '#4f46e5',
    NONE: '#84cc16',
    UNKNOWN: '#6b7280'
};

/**
 * Returns the color code associated with a given severity level
 * @param severity - The severity level to get the color for
 * @returns The hex color code for the severity level
 */
export const getSeverityColor = (severity: SeverityLevel): string => {
    return colors[severity] || colors.UNKNOWN;
};

/**
 * Formats a date string into a more readable format
 * @param dateString - The date string to format
 * @returns The formatted date string
 */
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};