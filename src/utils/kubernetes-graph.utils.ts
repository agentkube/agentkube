

// Make K8sResourceData flexible to handle any type of resource data
export interface K8sResourceData extends Record<string, unknown> {
  // Common properties that most resources have
  resourceType: string;
  
  // Optional properties that may or may not exist depending on resource type
  createdAt?: string;
  group?: string;
  labels?: Record<string, string> | null;
  namespace?: string;
  resourceName?: string;
  status?: Record<string, unknown>;
  version?: string;
  
  // Container-specific properties
  name?: string;
  image?: string;
  podName?: string;
  
  // Image-specific properties
  container?: string;
  
  // Any other properties that might come from the API
  [key: string]: unknown;
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