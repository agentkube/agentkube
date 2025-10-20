/**
 * Index action types
 */
export type IndexAction = 'rebuild' | 'refresh' | 'optimize';

/**
 * Index status types
 */
export type IndexStatusType = 'not_indexed' | 'healthy' | 'indexing' | 'error';

/**
 * Sync status types
 */
export type SyncStatusType = 'active' | 'inactive' | 'error';

/**
 * Options for creating/rebuilding an index
 */
export interface IndexOptions {
  action: IndexAction;
  resourceTypes?: string[];
  namespaces?: string[];
  async?: boolean;
}

/**
 * Statistics about an index
 */
export interface IndexStats {
  documentCount: number;
  indexSize: string;
  lastIndexed: string;
  lastUpdated: string;
  totalUpdates: number;
  totalDeletes: number;
  totalBatches: number;
  resourceBreakdown?: Record<string, number>;
  indexingStarted?: string;
  indexingEnded?: string;
}

/**
 * Real-time sync status information
 */
export interface SyncStatus {
  enabled: boolean;
  status: SyncStatusType;
  lastEvent: string;
  eventsProcessed: number;
}

/**
 * Information about an ongoing operation
 */
export interface OperationInfo {
  operationId: string;
  type: string;
  status: string;
  progress: number;
  startedAt: string;
}

/**
 * Status of a cluster index
 */
export interface IndexStatus {
  cluster: string;
  status: IndexStatusType;
  stats?: IndexStats;
  sync?: SyncStatus;
  currentOperation?: OperationInfo;
  error?: string;
  message?: string;
}

/**
 * Response from index creation/rebuild
 */
export interface IndexResponse {
  cluster: string;
  action: IndexAction;
  status: string;
  operationId?: string;
  estimatedDuration?: string;
  message?: string;
  stats?: IndexStats;
}

/**
 * Response from listing all indexed clusters
 */
export interface IndexedClustersResponse {
  clusters: IndexStatus[];
  totalClusters: number;
  totalDocuments: number;
}

/**
 * Response from deleting an index
 */
export interface DeleteIndexResponse {
  cluster: string;
  message: string;
}
