import { OPERATOR_URL } from "@/config";
import {
  IndexOptions,
  IndexStatus,
  IndexResponse,
  IndexedClustersResponse,
  DeleteIndexResponse,
} from "@/types/indexing";

/**
 * Creates or rebuilds an index for a cluster
 *
 * @param clusterName The cluster name to index
 * @param options Index options (action, resourceTypes, namespaces, async)
 * @returns Promise with the index response
 */
export async function createOrRebuildIndex(
  clusterName: string,
  options: IndexOptions
): Promise<IndexResponse> {
  const url = `${OPERATOR_URL}/cluster/${clusterName}/index`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to ${options.action} index: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating/rebuilding index:', error);
    throw error;
  }
}

/**
 * Gets the status of a cluster's index
 *
 * @param clusterName The cluster name to check
 * @returns Promise with the index status
 */
export async function getIndexStatus(
  clusterName: string
): Promise<IndexStatus> {
  const url = `${OPERATOR_URL}/cluster/${clusterName}/index/status`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to get index status: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting index status:', error);
    throw error;
  }
}

/**
 * Lists all indexed clusters
 *
 * @returns Promise with all indexed clusters and their stats
 */
export async function listIndexedClusters(): Promise<IndexedClustersResponse> {
  const url = `${OPERATOR_URL}/indices/clusters`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to list indexed clusters: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing indexed clusters:', error);
    throw error;
  }
}

/**
 * Deletes the index for a cluster
 *
 * @param clusterName The cluster name whose index should be deleted
 * @returns Promise with the deletion response
 */
export async function deleteClusterIndex(
  clusterName: string
): Promise<DeleteIndexResponse> {
  const url = `${OPERATOR_URL}/cluster/${clusterName}/index`;

  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Failed to delete index: ${response.statusText}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error('Error deleting cluster index:', error);
    throw error;
  }
}

/**
 * Rebuilds an index for a cluster (convenience function)
 *
 * @param clusterName The cluster name to rebuild index for
 * @param async Whether to run indexing in background (default: true)
 * @returns Promise with the index response
 */
export async function rebuildIndex(
  clusterName: string,
  async: boolean = true
): Promise<IndexResponse> {
  return createOrRebuildIndex(clusterName, {
    action: 'rebuild',
    async,
  });
}

/**
 * Refreshes an existing index for a cluster (convenience function)
 *
 * @param clusterName The cluster name to refresh index for
 * @param async Whether to run indexing in background (default: true)
 * @returns Promise with the index response
 */
export async function refreshIndex(
  clusterName: string,
  async: boolean = true
): Promise<IndexResponse> {
  return createOrRebuildIndex(clusterName, {
    action: 'refresh',
    async,
  });
}

/**
 * Checks if a cluster has an index and if it's healthy
 *
 * @param clusterName The cluster name to check
 * @returns Promise resolving to true if indexed and healthy, false otherwise
 */
export async function isClusterIndexed(
  clusterName: string
): Promise<boolean> {
  try {
    const status = await getIndexStatus(clusterName);
    return status.status === 'healthy' || status.status === 'indexing';
  } catch (error) {
    console.error('Error checking if cluster is indexed:', error);
    return false;
  }
}

/**
 * Gets the index freshness status (whether index needs refresh)
 * Checks if last indexed time is more than 24 hours ago
 *
 * @param clusterName The cluster name to check
 * @returns Promise with boolean indicating if index is stale
 */
export async function isIndexStale(
  clusterName: string
): Promise<boolean> {
  try {
    const status = await getIndexStatus(clusterName);

    if (!status.stats?.lastIndexed) {
      return true;
    }

    const lastIndexed = new Date(status.stats.lastIndexed);
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    return lastIndexed.getTime() < oneDayAgo;
  } catch (error) {
    console.error('Error checking index freshness:', error);
    return true;
  }
}
