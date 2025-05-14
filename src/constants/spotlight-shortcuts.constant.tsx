export type kubeResourceShortcuts = {
  title: string;
  shortcut: string;
  description: string;
  color: string;
  resourceType: string; 
};


export const kubeShortcuts: kubeResourceShortcuts[] = [
  {
    title: 'Pods',
    shortcut: 'po',
    description: 'Search pods in your cluster',
    color: 'rgba(59, 130, 246, 0.6)', // Blue
    resourceType: 'pods'
  },
  {
    title: 'Deployments',
    shortcut: 'deploy',
    description: 'Search deployments in your cluster',
    color: 'rgba(16, 185, 129, 0.6)', // Green
    resourceType: 'deployments'
  },
  {
    title: 'StatefulSets',
    shortcut: 'sts',
    description: 'Search statefulsets in your cluster',
    color: 'rgba(245, 158, 11, 0.6)', // Amber
    resourceType: 'statefulsets'
  },
  {
    title: 'DaemonSets',
    shortcut: 'ds',
    description: 'Search daemonsets in your cluster',
    color: 'rgba(236, 72, 153, 0.6)', // Pink
    resourceType: 'daemonsets'
  },
  {
    title: 'ReplicaSets',
    shortcut: 'rs',
    description: 'Search replicasets in your cluster',
    color: 'rgba(139, 92, 246, 0.6)', // Purple
    resourceType: 'replicasets'
  },
  {
    title: 'Jobs',
    shortcut: 'job',
    description: 'Search jobs in your cluster',
    color: 'rgba(239, 68, 68, 0.6)', // Red
    resourceType: 'jobs'
  },
  {
    title: 'CronJobs',
    shortcut: 'cj',
    description: 'Search cronjobs in your cluster',
    color: 'rgba(249, 115, 22, 0.6)', // Orange
    resourceType: 'cronjobs'
  },
  {
    title: 'Services',
    shortcut: 'svc',
    description: 'Search services in your cluster',
    color: 'rgba(37, 99, 235, 0.6)', // Indigo
    resourceType: 'services'
  },
  {
    title: 'ConfigMaps',
    shortcut: 'cm',
    description: 'Search configmaps in your cluster',
    color: 'rgba(20, 184, 166, 0.6)', // Teal
    resourceType: 'configmaps'
  },
  {
    title: 'Secrets',
    shortcut: 'secret',
    description: 'Search secrets in your cluster',
    color: 'rgba(124, 58, 237, 0.6)', // Violet
    resourceType: 'secrets'
  },
  {
    title: 'PersistentVolumeClaims',
    shortcut: 'pvc',
    description: 'Search persistent volume claims in your cluster',
    color: 'rgba(217, 119, 6, 0.6)', // Amber/Orange
    resourceType: 'persistentvolumeclaims'
  },
  {
    title: 'PersistentVolumes',
    shortcut: 'pv',
    description: 'Search persistent volumes in your cluster',
    color: 'rgba(79, 70, 229, 0.6)', // Indigo/Purple
    resourceType: 'persistentvolumes'
  },
  {
    title: 'Endpoints',
    shortcut: 'ep',
    description: 'Search endpoints in your cluster',
    color: 'rgba(6, 182, 212, 0.6)', // Cyan
    resourceType: 'endpoints'
  }
];