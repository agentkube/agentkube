import { TrivyConfigAuditReport } from "@/types/trivy";

export const AUDIT_REPORT_DEMO_DATA: TrivyConfigAuditReport[] = [
  {
    apiVersion: "aquasecurity.github.io/v1alpha1",
    kind: "ConfigAuditReport",
    metadata: {
      name: "sample-postgres-statefulset",
      namespace: "database",
      creationTimestamp: "2024-01-15T09:15:00Z",
      labels: {
        "trivy-operator.resource.name": "sample-postgres-statefulset",
        "trivy-operator.resource.kind": "StatefulSet",
        "trivy-operator.resource.namespace": "database"
      }
    },
    report: {
      summary: {
        criticalCount: 0,
        highCount: 1,
        mediumCount: 2,
        lowCount: 3
      },
      checks: [
        {
          id: "KSV003",
          checkID: "KSV003",
          title: "Default capabilities not dropped",
          description: "The container should drop all default capabilities and add only those that are needed for its function.",
          severity: "HIGH",
          category: "Security Context",
          success: false,
          messages: [
            "Container 'postgres' of StatefulSet 'postgres-statefulset' should add 'ALL' to 'securityContext.capabilities.drop'"
          ]
        },
        {
          id: "KSV011",
          checkID: "KSV011",
          title: "CPU not limited",
          description: "Enforcing CPU limits prevents DoS via resource exhaustion.",
          severity: "MEDIUM",
          category: "Resource Management",
          success: false,
          messages: [
            "Container 'postgres' of StatefulSet 'postgres-statefulset' should set 'resources.limits.cpu'"
          ]
        },
        {
          id: "KSV016",
          checkID: "KSV016",
          title: "Image tag ':latest' used",
          description: "Using a fixed tag is recommended to avoid accidental upgrades.",
          severity: "LOW",
          category: "Images",
          success: false,
          messages: [
            "Container 'postgres' of StatefulSet 'postgres-statefulset' should specify an image tag"
          ]
        }
      ]
    }
  }
];