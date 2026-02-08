// types/k8s.ts
import {
  // Workloads
  V1Pod,
  V1Deployment,
  V1StatefulSet,
  V1DaemonSet,
  V1ReplicaSet,
  V1ReplicationController,
  V1Job,
  V1CronJob,
  
  // Config 
  V1ConfigMap,
  V1Secret,
  V1ResourceQuota,
  V1LimitRange,
  V1HorizontalPodAutoscaler,
  V1PodDisruptionBudget,
  V1PriorityClass,
  V1RuntimeClass,
  V1Lease,
  V1ValidatingWebhookConfiguration,
  V1MutatingWebhookConfiguration,

  // Network
  V1Service,
  V1Endpoints,
  V1Ingress,
  V1IngressClass,
  V1NetworkPolicy,
  
  // Storage
  V1PersistentVolume,
  V1PersistentVolumeClaim,
  V1StorageClass,

  V1ServiceAccount,
  V1ClusterRole,
  V1Role,
  V1RoleBinding,
  V1ClusterRoleBinding,

  V1ObjectMeta,
  // CoreV1EventList,
  CoreV1Event,
  V1Namespace,

} from '@kubernetes/client-node';

export type KubernetesResource =
  | V1Namespace
  | V1Pod
  | V1Deployment
  | V1StatefulSet
  | V1DaemonSet
  | V1ReplicaSet
  | V1ReplicationController
  | V1Service
  | V1ConfigMap
  | V1Secret
  | V1Job
  | V1CronJob
  | V1Endpoints
  | V1MutatingWebhookConfiguration
  | V1Ingress
  | V1IngressClass
  | V1NetworkPolicy
  | V1PersistentVolume
  | V1PersistentVolumeClaim
  | V1StorageClass
  | V1ServiceAccount
  | V1ClusterRole
  | V1Role
  | V1RoleBinding
  | V1ClusterRoleBinding
  | V1ResourceQuota
  | V1LimitRange
  | V1HorizontalPodAutoscaler
  | V1PodDisruptionBudget
  | V1PriorityClass
  | V1RuntimeClass
  | V1Lease
  | V1ValidatingWebhookConfiguration;

export type KubernetesMetadata = V1ObjectMeta;

export interface UIEvent extends CoreV1Event {
  // Additional fields for UI presentation
  summary?: string;
  count: number;
  age?: string;
}

export interface ResourceViewerProps<T = KubernetesResource> {
  resource: T;
  events?: UIEvent[];
  metrics?: any; // Add specific metrics type if needed
  onReload?: () => void;
}

// Type guards for specific resource types
export const isPod = (resource: KubernetesResource): resource is V1Pod => {
  return resource.kind === 'Pod';
};

export const isDeployment = (resource: KubernetesResource): resource is V1Deployment => {
  return resource.kind === 'Deployment';
};

export const isStatefulSet = (resource: KubernetesResource): resource is V1StatefulSet => {
  return resource.kind === 'StatefulSet';
};

// Custom Resource handling
export interface CustomResource<TSpec = any, TStatus = any> {
  apiVersion: string;
  kind: string;
  metadata: V1ObjectMeta;
  spec: TSpec;
  status?: TStatus;
}

export const isCustomResource = (resource: any): resource is CustomResource => {
  return resource.apiVersion.includes('/');
};

// Helper function to format age
export const getAge = (creationTimestamp: string) => {
  const created = new Date(creationTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d${hours}h`;
  } else if (hours > 0) {
    return `${hours}h${minutes}m`;
  } else {
    return `${minutes}m`;
  }
};

