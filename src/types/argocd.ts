// ArgoCD Types based on Argo CRDs

export interface ArgoApplication {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'Application';
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec: {
    project: string;
    source: {
      repoURL: string;
      targetRevision: string;
      path?: string;
      chart?: string;
      helm?: {
        values?: string;
        valueFiles?: string[];
        parameters?: Array<{
          name: string;
          value: string;
        }>;
      };
    };
    destination: {
      server: string;
      namespace: string;
    };
    syncPolicy?: {
      automated?: {
        prune?: boolean;
        selfHeal?: boolean;
        allowEmpty?: boolean;
      };
      syncOptions?: string[];
      retry?: {
        limit?: number;
        backoff?: {
          duration?: string;
          factor?: number;
          maxDuration?: string;
        };
      };
    };
  };
  status?: {
    sync?: {
      status: 'Synced' | 'OutOfSync' | 'Unknown';
      revision?: string;
      comparedTo?: {
        source: {
          repoURL: string;
          targetRevision: string;
        };
      };
    };
    health?: {
      status: 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended' | 'Missing' | 'Unknown';
      message?: string;
    };
    operationState?: {
      phase: 'Running' | 'Succeeded' | 'Failed' | 'Error' | 'Terminating';
      message?: string;
      startedAt?: string;
      finishedAt?: string;
      operation?: {
        sync?: {
          revision?: string;
        };
      };
    };
    resources?: Array<{
      group?: string;
      kind: string;
      name: string;
      namespace?: string;
      status?: 'Synced' | 'OutOfSync';
      health?: {
        status: string;
        message?: string;
      };
    }>;
    reconciledAt?: string;
    summary?: {
      images?: string[];
      externalURLs?: string[];
    };
  };
}

export interface ArgoProject {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'AppProject';
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    description?: string;
    sourceRepos: string[];
    destinations: Array<{
      namespace: string;
      server: string;
    }>;
    clusterResourceWhitelist?: Array<{
      group: string;
      kind: string;
    }>;
    clusterResourceBlacklist?: Array<{
      group: string;
      kind: string;
    }>;
    namespaceResourceWhitelist?: Array<{
      group: string;
      kind: string;
    }>;
    namespaceResourceBlacklist?: Array<{
      group: string;
      kind: string;
    }>;
  };
  status?: {
    jwtTokensByRole?: Record<string, any>;
  };
}

export interface ArgoApplicationList {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'ApplicationList';
  metadata: {
    resourceVersion?: string;
  };
  items: ArgoApplication[];
}

export interface ArgoProjectList {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'AppProjectList';
  metadata: {
    resourceVersion?: string;
  };
  items: ArgoProject[];
}

export interface ArgoApplicationSet {
  apiVersion: 'argoproj.io/v1alpha1';
  kind: 'ApplicationSet';
  metadata: {
    name: string;
    namespace: string;
    uid?: string;
    creationTimestamp?: string;
  };
  spec: {
    generators: Array<any>;
    template: {
      metadata: {
        name: string;
        labels?: Record<string, string>;
      };
      spec: ArgoApplication['spec'];
    };
  };
  status?: {
    conditions?: Array<{
      type: string;
      status: string;
      message?: string;
      lastTransitionTime?: string;
    }>;
  };
}

export interface ArgoConfig {
  namespace: string;
  service: string;
}

export interface ArgoStats {
  totalApplications: number;
  syncedApplications: number;
  healthyApplications: number;
  outOfSyncApplications: number;
  degradedApplications: number;
  progressingApplications: number;
  totalProjects: number;
  totalApplicationSets: number;
}

export interface ArgoApplicationSummary {
  name: string;
  namespace: string;
  project: string;
  syncStatus: 'Synced' | 'OutOfSync' | 'Unknown';
  healthStatus: 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended' | 'Missing' | 'Unknown';
  repoURL: string;
  targetRevision: string;
  destinationServer: string;
  destinationNamespace: string;
  automated: boolean;
  lastSyncTime?: string;
  resourcesCount?: number;
}
