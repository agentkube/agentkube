export interface ArtifactHubChart {
  package_id: string;
  name: string;
  normalized_name: string;
  display_name?: string;
  description: string;
  logo_image_id: string;
  repository: {
    repository_id: string;
    name: string;
    display_name: string;
    url: string;
    verified_publisher: boolean;
    organization_name: string;
  };
  version: string;
  app_version: string;
  stars: number;
  ts: number;
  security_report_summary?: {
    low: number;
    high: number;
    medium: number;
    unknown: number;
    critical: number;
  };
  license?: string;
  production_organizations_count?: number;
}

export interface ChartVersion {
  version: string;
  publishedAt: string;
}