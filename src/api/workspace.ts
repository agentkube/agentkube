import { OPERATOR_URL } from "@/config";
import type {
  ClusterInfo,
  Workspace,
  WorkspaceResponse,
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  AddClusterRequest,
  WorkspaceApiResponse,
} from "@/types/workspace";

/**
 * Lists all workspaces
 * @returns Promise with array of workspaces
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  try {
    const response = await fetch(`${OPERATOR_URL}/workspaces`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to list workspaces (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to list workspaces (${response.status}): ${errorText}`);
      }
    }

    const data: WorkspaceResponse = await response.json();
    return data.workspaces;
  } catch (error) {
    console.error('Error listing workspaces:', error);
    throw error;
  }
}

/**
 * Gets a specific workspace by name
 * @param name The workspace name
 * @returns Promise with the workspace data
 */
export async function getWorkspace(name: string): Promise<Workspace> {
  try {
    const response = await fetch(`${OPERATOR_URL}/workspaces/${encodeURIComponent(name)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to get workspace (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to get workspace (${response.status}): ${errorText}`);
      }
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting workspace:', error);
    throw error;
  }
}

/**
 * Creates a new workspace
 * @param workspaceData The workspace data to create
 * @returns Promise with the created workspace
 */
export async function createWorkspace(workspaceData: CreateWorkspaceRequest): Promise<Workspace> {
  try {
    const response = await fetch(`${OPERATOR_URL}/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(workspaceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to create workspace (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to create workspace (${response.status}): ${errorText}`);
      }
    }

    const result: WorkspaceApiResponse = await response.json();
    return result.workspace!;
  } catch (error) {
    console.error('Error creating workspace:', error);
    throw error;
  }
}

/**
 * Updates an existing workspace
 * @param name The workspace name to update
 * @param updateData The data to update
 * @returns Promise with the updated workspace
 */
export async function updateWorkspace(name: string, updateData: UpdateWorkspaceRequest): Promise<Workspace> {
  try {
    const response = await fetch(`${OPERATOR_URL}/workspaces/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(updateData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to update workspace (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to update workspace (${response.status}): ${errorText}`);
      }
    }

    const result: WorkspaceApiResponse = await response.json();
    return result.workspace!;
  } catch (error) {
    console.error('Error updating workspace:', error);
    throw error;
  }
}

/**
 * Deletes a workspace
 * @param name The workspace name to delete
 * @returns Promise that resolves when deletion is complete
 */
export async function deleteWorkspace(name: string): Promise<void> {
  try {
    const response = await fetch(`${OPERATOR_URL}/workspaces/${name}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to delete workspace (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to delete workspace (${response.status}): ${errorText}`);
      }
    }

    // Delete operation successful
    return;
  } catch (error) {
    console.error('Error deleting workspace:', error);
    throw error;
  }
}

/**
 * Adds a cluster to an existing workspace
 * @param workspaceName The workspace name
 * @param clusterData The cluster data to add
 * @returns Promise that resolves when cluster is added
 */
export async function addClusterToWorkspace(workspaceName: string, clusterData: AddClusterRequest): Promise<void> {
  try {
    const response = await fetch(`${OPERATOR_URL}/workspaces/${encodeURIComponent(workspaceName)}/clusters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(clusterData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to add cluster to workspace (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to add cluster to workspace (${response.status}): ${errorText}`);
      }
    }

    // Addition successful
    return;
  } catch (error) {
    console.error('Error adding cluster to workspace:', error);
    throw error;
  }
}

/**
 * Removes a cluster from a workspace
 * @param workspaceName The workspace name
 * @param clusterName The cluster name to remove
 * @returns Promise that resolves when cluster is removed
 */
export async function removeClusterFromWorkspace(workspaceName: string, clusterName: string): Promise<void> {
  try {
    const response = await fetch(`${OPERATOR_URL}/workspaces/${encodeURIComponent(workspaceName)}/clusters/${encodeURIComponent(clusterName)}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || `Failed to remove cluster from workspace (${response.status}): ${response.statusText}`);
      } catch (e) {
        throw new Error(`Failed to remove cluster from workspace (${response.status}): ${errorText}`);
      }
    }

    // Removal successful
    return;
  } catch (error) {
    console.error('Error removing cluster from workspace:', error);
    throw error;
  }
}

// Convenience functions for common operations

/**
 * Creates a workspace with initial clusters
 * @param name Workspace name
 * @param description Optional description
 * @param clusters Array of clusters to add
 * @returns Promise with the created workspace
 */
export async function createWorkspaceWithClusters(
  name: string,
  description?: string,
  clusters?: ClusterInfo[]
): Promise<Workspace> {
  return createWorkspace({
    name,
    description,
    clusters: clusters || [],
  });
}

/**
 * Updates only the workspace description
 * @param name Workspace name
 * @param description New description
 * @returns Promise with updated workspace
 */
export async function updateWorkspaceDescription(name: string, description: string): Promise<Workspace> {
  return updateWorkspace(name, { description });
}

/**
 * Renames a workspace
 * @param currentName Current workspace name
 * @param newName New workspace name
 * @returns Promise with updated workspace
 */
export async function renameWorkspace(currentName: string, newName: string): Promise<Workspace> {
  return updateWorkspace(currentName, { name: newName });
}