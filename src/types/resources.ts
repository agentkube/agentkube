/**
 * Represents a Kubernetes API Resources
 */
export interface ApiResources {
  Group: string;
  Version: string;
  Resource: string;
  Kind: string;
  Namespaced: boolean;
}

export interface DeploymentInfo {
  name: string;
  namespace: string;
  pods: string;
  replicas: number;
  age: string;
  conditions: string[];
}

export interface PodInfo {
  name: string;
  namespace: string;
  containers: number;
  cpu: string;
  memory: string;
  restarts: number;
  controlledBy: string;
  node: string;
  qos: string;
  age: string;
  status: string;
}

export interface DaemonSetInfo {
  name: string;
  namespace: string;
  pods: string;
  nodeSelector: string[];
  age: string;
}

export interface StatefulSetInfo {
  name: string;
  namespace: string;
  pods: string;
  replicas: number;
  age: string;
}

export interface ReplicaSetInfo {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  age: string;
}

export interface ReplicationControllerInfo {
  name: string;
  namespace: string;
  replica: number;
  desiredReplica: number;
  selector: string[];
}

export interface CronJobInfo {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  lastSchedule: string;
  age: string;
}

export interface JobInfo {
  name: string;
  namespace: string;
  completion: string;
  age: string;
  conditions: string[];
}

// Config Types
export interface ConfigMapInfo {
  name: string;
  namespace: string;
  keys: string[];
  age: string;
}

export interface SecretInfo {
  name: string;
  namespace: string;
  labels: Record<string, string>;
  keys: string[];
  type: string;
  age: string;
}

export interface HPAInfo {
  name: string;
  namespace: string;
  metrics: string[];
  minPods: number;
  maxPods: number;
  replicas: number;
  age: string;
  status: string;
}

export interface ResourceQuotaInfo {
  name: string;
  namespace: string;
  age: string;
}

export interface LimitRangeInfo {
  name: string;
  namespace: string;
  age: string;
}

export interface VPAInfo {
  name: string;
  namespace: string;
  age: string;
  mode: string;
  cpu: string;
  memory: string;
}

export interface PDBInfo {
  name: string;
  namespace: string;
  age: string;
  minAvailable: string;
  maxUnavailable: string;
  currentHealthy: number;
  desiredHealthy: number;
}

export interface PriorityClassInfo {
  name: string;
  age: string;
  value: number;
  globalDefault: boolean;
}

export interface RuntimeClassInfo {
  name: string;
  handler: string;
  age: string;
}

export interface LeaseInfo {
  name: string;
  namespace: string;
  age: string;
  holder: string;
}

export interface MutatingWebhookInfo {
  name: string;
  webhooks: number;
  age: string;
}

export interface ValidatingWebhookInfo {
  name: string;
  webhooks: number;
  age: string;
}

// Network Types
export interface ServiceInfo {
  name: string;
  namespace: string;
  age: string;
  type: string;
  clusterIP: string;
  ports: string;
  externalIP: string[];
  selector: Record<string, string>;
  status: string;
}

export interface EndpointInfo {
  name: string;
  namespace: string;
  age: string;
  endpoints: string[];
}

export interface IngressInfo {
  name: string;
  namespace: string;
  age: string;
  loadBalancers: string[];
  rules: string[];
}

export interface IngressClassInfo {
  name: string;
  namespace: string;
  controller: string;
  apiGroup: string;
  scope: string;
  kind: string;
}

export interface NetworkPolicyInfo {
  name: string;
  namespace: string;
  age: string;
  policyTypes: string[];
}

// Storage Types
export interface PVCInfo {
  name: string;
  namespace: string;
  storageClass: string;
  size: string;
  pods: string;
  age: string;
  status: string;
}

export interface PVInfo {
  name: string;
  storageClass: string;
  capacity: string;
  claim: string;
  age: string;
  status: string;
}

export interface StorageClassInfo {
  name: string;
  provisioner: string;
  reclaimPolicy: string;
  default: boolean;
  age: string;
}

export interface EventInfo {
  type: string;
  message: string;
  namespace: string;
  involvedObject: string;
  source: string;
  count: number;
  age: string;
  lastSeen: string;
}

export interface NamespaceInfo {
  name: string;
  labels: Record<string, string>;
  age: string;
  status: string;
}

export interface ClusterRoleBindingInfo {
  name: string;
  roleRef: string;
  bindings: string[];
  age: string;
}

export interface ServiceAccountInfo {
  name: string;
  namespace: string;
  secrets: string[];
  imagePullSecrets: string[];
  labels: Record<string, string>;
  age: string;
}

export interface ClusterRoleInfo {
  name: string;
  age: string;
}

export interface RoleInfo {
  name: string;
  namespace: string;
  age: string;
}

export interface IngressInfo {
  name: string;
  namespace: string;
  loadBalancers: string[];
  rules: string[];
  age: string;
}

export interface RoleBindingInfo {
  name: string;
  namespace: string;
  bindings: string[];
  age: string;
}

// Resource Types Map
export type ResourceType =
  | "validatingwebhookconfigurations"
  | "mutatingwebhookconfigurations"
  | "nodes"
  | "deployments"
  | "pods"
  | "daemonsets"
  | "statefulsets"
  | "replicasets"
  | "replicationcontrollers"
  | "cronjobs"
  | "jobs"
  | "configmaps"
  | "secrets"
  | "hpa"
  | "resourcequotas"
  | "limitranges"
  | "verticalpodautoscaler"
  | "pdb"
  | "priorityclasses"
  | "runtimeclasses"
  | "leases"
  | "services"
  | "endpoints"
  | "ingresses"
  | "ingressclasses"
  | "networkpolicies"
  | "pvcs"
  | "pvs"
  | "storageclasses"
  | "events"
  | "namespaces"
  | "clusterrolebindings"
  | "clusterroles"
  | "roles"
  | "serviceaccounts"
  | "ingresses"
  | "rolebindings";

export type ResourceInfoType = {
  validatingwebhookconfigurations: ValidatingWebhookInfo[];
  mutatingwebhookconfigurations: MutatingWebhookInfo[];
  nodes: NodeInfo[];
  deployments: DeploymentInfo[];
  pods: PodInfo[];
  daemonsets: DaemonSetInfo[];
  statefulsets: StatefulSetInfo[];
  replicasets: ReplicaSetInfo[];
  replicationcontrollers: ReplicationControllerInfo[];
  cronjobs: CronJobInfo[];
  jobs: JobInfo[];
  configmaps: ConfigMapInfo[];
  secrets: SecretInfo[];
  hpa: HPAInfo[];
  resourcequotas: ResourceQuotaInfo[];
  limitranges: LimitRangeInfo[];
  verticalpodautoscaler: VPAInfo[];
  pdb: PDBInfo[];
  priorityclasses: PriorityClassInfo[];
  runtimeclasses: RuntimeClassInfo[];
  leases: LeaseInfo[];
  services: ServiceInfo[];
  endpoints: EndpointInfo[];
  ingressclasses: IngressClassInfo[];
  networkpolicies: NetworkPolicyInfo[];
  pvcs: PVCInfo[];
  pvs: PVInfo[];
  storageclasses: StorageClassInfo[];
  events: EventInfo[];
  namespaces: NamespaceInfo[];
  clusterrolebindings: ClusterRoleBindingInfo[];
  serviceaccounts: ServiceAccountInfo[];
  clusterroles: ClusterRoleInfo[];
  roles: RoleInfo[];
  ingresses: IngressInfo[];
  rolebindings: RoleBindingInfo[];
};

export interface NodeCondition {
  type: string;
  status: string;
  message: string;
}

export interface NodeInfo {
  name: string;
  cpu: string;
  memory: string;
  disk: string;
  taints: string[];
  roles: string[];
  version: string;
  age: string;
  conditions: NodeCondition[];
}
