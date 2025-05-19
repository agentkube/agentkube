import React from 'react';
import { 
  Terminal
} from 'lucide-react';

export const ExplorerSuggestionsConstant = [
  // Applications
  {
    id: 'applications',
    title: 'View Applications',
    description: 'Check status of all applications',
    icon: <Terminal className="w-4 h-4" />
  },
  
  // Nodes
  {
    id: 'nodes',
    title: 'View Nodes',
    description: 'Check status of all nodes',
    icon: <Terminal className="w-4 h-4" />
  },
  
  // Workloads
  {
    id: 'pods',
    title: 'View Pods',
    description: 'Check status of all pods',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'deployments',
    title: 'View Deployments',
    description: 'Check status of all deployments',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'daemonsets',
    title: 'View Daemon Sets',
    description: 'Check status of all daemon sets',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'statefulsets',
    title: 'View Stateful Sets',
    description: 'Check status of all stateful sets',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'replicasets',
    title: 'View Replica Sets',
    description: 'Check status of all replica sets',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'replication-controllers',
    title: 'View Replication Controllers',
    description: 'Check status of all replication controllers',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'jobs',
    title: 'View Jobs',
    description: 'Check status of all jobs',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'cronjobs',
    title: 'View Cron Jobs',
    description: 'Check status of all cron jobs',
    icon: <Terminal className="w-4 h-4" />
  },

  // Config
  {
    id: 'config-maps',
    title: 'View Config Maps',
    description: 'Check all config maps',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'secrets',
    title: 'View Secrets',
    description: 'Check all secrets',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'resourcequotas',
    title: 'View Resource Quotas',
    description: 'Check all resource quotas',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'limitranges',
    title: 'View Limit Ranges',
    description: 'Check all limit ranges',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'horizontalpodautoscalers',
    title: 'View Horizontal Pod Autoscalers',
    description: 'Check all horizontal pod autoscalers',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'verticalpodautoscalers',
    title: 'View Vertical Pod Autoscalers',
    description: 'Check all vertical pod autoscalers',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'poddisruptionbudgets',
    title: 'View Pod Disruption Budgets',
    description: 'Check all pod disruption budgets',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'priorityclasses',
    title: 'View Priority Classes',
    description: 'Check all priority classes',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'runtimeclasses',
    title: 'View Runtime Classes',
    description: 'Check all runtime classes',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'leases',
    title: 'View Leases',
    description: 'Check all leases',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'mutatingwebhookconfigurations',
    title: 'View Mutating Webhook Configs',
    description: 'Check all mutating webhook configurations',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'validatingwebhookconfigurations',
    title: 'View Validating Webhook Configs',
    description: 'Check all validating webhook configurations',
    icon: <Terminal className="w-4 h-4" />
  },

  // Network
  {
    id: 'services',
    title: 'View Services',
    description: 'Check status of all services',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'endpoints',
    title: 'View Endpoints',
    description: 'Check all endpoints',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'ingresses',
    title: 'View Ingresses',
    description: 'Check all ingresses',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'ingressclasses',
    title: 'View Ingress Classes',
    description: 'Check all ingress classes',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'networkpolicies',
    title: 'View Network Policies',
    description: 'Check all network policies',
    icon: <Terminal className="w-4 h-4" />
  },

  // Storage
  {
    id: 'persistentvolumeclaims',
    title: 'View Persistent Volume Claims',
    description: 'Check all persistent volume claims',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'persistentvolumes',
    title: 'View Persistent Volumes',
    description: 'Check all persistent volumes',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'storageclasses',
    title: 'View Storage Classes',
    description: 'Check all storage classes',
    icon: <Terminal className="w-4 h-4" />
  },

  // Namespaces
  {
    id: 'namespaces',
    title: 'View Namespaces',
    description: 'Check all namespaces',
    icon: <Terminal className="w-4 h-4" />
  },

  // Events
  {
    id: 'events',
    title: 'View Events',
    description: 'Check all events',
    icon: <Terminal className="w-4 h-4" />
  },

  // Helm
  {
    id: 'charts',
    title: 'View Helm Charts',
    description: 'Check all helm charts',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'releases',
    title: 'View Helm Releases',
    description: 'Check all helm releases',
    icon: <Terminal className="w-4 h-4" />
  },

  // Access Control
  {
    id: 'serviceaccounts',
    title: 'View Service Accounts',
    description: 'Check all service accounts',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'clusterroles',
    title: 'View Cluster Roles',
    description: 'Check all cluster roles',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'roles',
    title: 'View Roles',
    description: 'Check all roles',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'clusterrolebindings',
    title: 'View Cluster Role Bindings',
    description: 'Check all cluster role bindings',
    icon: <Terminal className="w-4 h-4" />
  },
  {
    id: 'rolebindings',
    title: 'View Role Bindings',
    description: 'Check all role bindings',
    icon: <Terminal className="w-4 h-4" />
  },

  // Custom Resources
  {
    id: 'customresources',
    title: 'View Custom Resources',
    description: 'Check all custom resources',
    icon: <Terminal className="w-4 h-4" />
  }
];