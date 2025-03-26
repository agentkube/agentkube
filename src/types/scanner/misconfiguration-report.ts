// Trivy severity levels
type TrivySeverity = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Interface for code line details
interface CodeLine {
  Number: number;
  Content: string;
  IsCause: boolean;
  Annotation: string;
  Truncated: boolean;
  Highlighted: string;
  FirstCause: boolean;
  LastCause: boolean;
}

// Interface for code metadata
interface Code {
  Lines: CodeLine[] | null;
}

// Interface for cause metadata
interface CauseMetadata {
  Provider: string;
  Service: string;
  StartLine?: number;
  EndLine?: number;
  Code: Code;
}

// Interface for misconfiguration details
interface Misconfiguration {
  Type: string;
  ID: string;
  AVDID: string;
  Title: string;
  Description: string;
  Message: string;
  Namespace: string;
  Query: string;
  Resolution: string;
  Severity: TrivySeverity;
  PrimaryURL: string;
  References: string[];
  Status: 'PASS' | 'FAIL' | 'EXCEPTION';
  Layer: Record<string, unknown>;
  CauseMetadata: CauseMetadata;
}

// Interface for image configuration
interface ImageConfig {
  architecture: string;
  created: string;
  os: string;
  rootfs: {
    type: string;
    diff_ids: string[] | null;
  };
  config: Record<string, unknown>;
}

// Interface for metadata
interface Metadata {
  ImageConfig: ImageConfig;
}

// Interface for misconfiguration summary
interface MisconfSummary {
  Successes: number;
  Failures: number;
  Exceptions?: number;
}

// Interface for scan results
interface ScanResult {
  Target: string;
  Class: string;
  Type: string;
  MisconfSummary: MisconfSummary;
  Misconfigurations: Misconfiguration[];
}

// Main interface for the misconfiguration report
interface MisconfigurationReport {
  SchemaVersion: number;
  CreatedAt: string;
  ArtifactName: string;
  ArtifactType: string;
  Metadata: Metadata;
  Results: ScanResult[];
}

export type {
  MisconfigurationReport,
  ScanResult,
  Misconfiguration,
  TrivySeverity,
  MisconfSummary,
  CauseMetadata,
  CodeLine,
  Code,
  ImageConfig,
  Metadata
};