export interface ImageSecurityReport {
  SchemaVersion: number;
  CreatedAt: string;
  ArtifactName: string;
  ArtifactType: string;
  Metadata: {
    OS: {
      Family: string;
      Name: string;
      EOSL: boolean;
    };
    ImageID: string;
    DiffIDs: string[];
    RepoTags: string[];
    RepoDigests: string[];
    ImageConfig: {
      architecture: string;
      container: string;
      created: string;
      docker_version: string;
      history: Array<{
        created: string;
        created_by: string;
        empty_layer?: boolean;
      }>;
      os: string;
      rootfs: {
        type: string;
        diff_ids: string[];
      };
      config: {
        Cmd: string[];
        Env: string[];
        Image: string;
      };
    };
  };
  Results: Array<{
    Target: string;
    Class: string;
    Type: string;
    Vulnerabilities: Array<{
      VulnerabilityID: string;
      PkgID: string;
      PkgName: string;
      PkgIdentifier: {
        PURL: string;
        UID: string;
      };
      InstalledVersion: string;
      FixedVersion: string;
      Status: string;
      Layer: {
        Digest: string;
        DiffID: string;
      };
      SeveritySource: string;
      PrimaryURL: string;
      DataSource: {
        ID: string;
        Name: string;
        URL: string;
      };
      Title: string;
      Description: string;
      Severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
      CweIDs: string[];
      VendorSeverity: {
        [key: string]: number;
      };
      CVSS: {
        nvd?: {
          V2Vector?: string;
          V3Vector?: string;
          V2Score?: number;
          V3Score?: number;
        };
        redhat?: {
          V3Vector?: string;
          V3Score?: number;
        };
      };
      References: string[];
      PublishedDate: string;
      LastModifiedDate: string;
    }>;
  }>;
}