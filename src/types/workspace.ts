/**
 * Workspace and cluster data structures
 */
export interface ClusterInfo {
  name: string;
  context: string;
  server: string;
}

export interface Workspace {
  name: string;
  description?: string;
  clusters: ClusterInfo[];
}

export interface WorkspaceResponse {
  workspaces: Workspace[];
}

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
  clusters?: ClusterInfo[];
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  clusters?: ClusterInfo[];
}

export interface AddClusterRequest {
  name: string;
  context: string;
  server: string;
}

export interface WorkspaceApiResponse {
  message: string;
  workspace?: Workspace;
}