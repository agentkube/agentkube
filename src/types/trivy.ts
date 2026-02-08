export interface TrivyMetadata {
  name: string;
  namespace: string;
  creationTimestamp: string;
  uid?: string;
  resourceVersion?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}



export interface TrivySummary {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}

export interface TrivyConfigAuditCheck {
  id: string;
  title: string;
  description: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  success: boolean;
  messages: string[];
  checkID?: string;
}

export interface TrivyReport {
  summary: TrivySummary;
  checks: TrivyConfigAuditCheck[];
}

export interface TrivyConfigAuditReport {
  apiVersion: string;
  kind: string;
  metadata: TrivyMetadata;
  report: TrivyReport;
}

export interface TrivyConfigAuditReportsResponse {
  apiVersion: string;
  kind: string;
  metadata: {
    continue?: string;
    resourceVersion: string;
    selfLink?: string;
  };
  items: TrivyConfigAuditReport[];
}

export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export const SEVERITY_LEVELS: readonly SeverityLevel[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export interface IndividualConfigAuditReport {
  apiVersion: string;
  kind: string;
  metadata: TrivyMetadata;
  report: {
    checks: Array<{
      category: string;
      checkID: string;
      description: string;
      messages: string[];
      severity: SeverityLevel;
      success: boolean;
      title: string;
    }>;
  };
}