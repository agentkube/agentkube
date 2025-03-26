

// Make K8sResourceData satisfy Record<string, unknown>
export interface K8sResourceData extends Record<string, unknown> {
  createdAt: string;
  group: string;
  labels: Record<string, string> | null;
  namespace: string;
  resourceName: string;
  resourceType: string;
  status: Record<string, unknown>;
  version: string;
}

export interface K8sNode {
  id: string;
  type: string;
  data: K8sResourceData;
}

export interface K8sEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
}

export interface K8sGraphData {
  nodes: K8sNode[];
  edges: K8sEdge[];
}