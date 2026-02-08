import { VulnerabilityReportItem } from "@/types/scanner/vulnerability-report";

export const VULN_REPORT_DEMO_DATA: VulnerabilityReportItem[] = [
  {
    name: "nginx-deployment-6d4cf56db6-xh8ks",
    namespace: "default",
    age: "5d",
    creationTimestamp: "2024-01-15T10:30:00Z",
    group: "apps",
    version: "v1",
    summary: {
      critical: 3,
      high: 8,
      medium: 15,
      low: 22,
      unknown: 2
    },
    owner: {
      name: "nginx-deployment",
      kind: "Deployment",
      apiVersion: "apps/v1"
    }
  }
];