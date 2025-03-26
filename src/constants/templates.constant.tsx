import React from 'react';
import { KubeResourceIconMap } from '@/constants/kuberesource-icon-map.constant';

export interface TemplateCategory {
  name: string;
  displayName: string;
  items: TemplateItem[];
}

export interface TemplateItem {
  name: string;
  description: string;
  path: string;
  resourceType?: string; // Maps to API resource types
  icon?: any;
}

export const GITHUB_BASE_URL = "https://raw.githubusercontent.com/agentkube/templates/refs/heads/main";

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    name: "workloads",
    displayName: "Workloads",
    items: [
      {
        name: "Pod",
        description: "Smallest deployable unit of computing",
        path: "workloads/pod.yaml",
        resourceType: "pods",
        icon: KubeResourceIconMap.pods
      },
      {
        name: "Deployment",
        description: "Run a stateless application with replicas",
        path: "workloads/deployment.yaml",
        resourceType: "deployments",
        icon: KubeResourceIconMap.deployments
      },
      {
        name: "StatefulSet",
        description: "Manage stateful applications with stable identities",
        path: "workloads/statefulsets.yaml",
        resourceType: "statefulsets",
        icon: KubeResourceIconMap.statefulsets
      },
      {
        name: "DaemonSet",
        description: "Run a pod on all (or some) nodes",
        path: "workloads/daemonset.yaml",
        resourceType: "daemonsets",
        icon: KubeResourceIconMap.daemonsets
      },
      {
        name: "ReplicaSet",
        description: "Maintain a stable set of replica Pods",
        path: "workloads/replicaset.yaml",
        resourceType: "replicasets",
        icon: KubeResourceIconMap.replicasets
      },
      {
        name: "Job",
        description: "Run a task to completion",
        path: "workloads/job.yaml",
        resourceType: "jobs",
        icon: KubeResourceIconMap.jobs
      },
      {
        name: "CronJob",
        description: "Run tasks on a schedule",
        path: "workloads/cronjob.yaml",
        resourceType: "cronjobs",
        icon: KubeResourceIconMap.cronjobs
      }
    ]
  },
  {
    name: "networking",
    displayName: "Networking",
    items: [
      {
        name: "Service (ClusterIP)",
        description: "Expose an application within the cluster",
        path: "network/services.yaml",
        resourceType: "services",
        icon: KubeResourceIconMap.services
      },
      {
        name: "Service (NodePort)",
        description: "Expose an application on each node's IP",
        path: "network/services-nodeport.yaml",
        resourceType: "services",
        icon: KubeResourceIconMap.services
      },
      {
        name: "Service (LoadBalancer)",
        description: "Expose an application using cloud provider's load balancer",
        path: "network/services-loadbalancer.yaml",
        resourceType: "services",
        icon: KubeResourceIconMap.services
      },
      {
        name: "Ingress",
        description: "Manage external access to services",
        path: "network/ingress.yaml",
        resourceType: "ingresses",
        icon: KubeResourceIconMap.ingresses
      },
      {
        name: "Ingress Class",
        description: "Define Ingress controller types",
        path: "network/ingressclass.yaml",
        resourceType: "ingressclasses",
        icon: KubeResourceIconMap.ingressclasses
      },
      {
        name: "Network Policy",
        description: "Control traffic flow between pods",
        path: "network/networkpolicies.yaml",
        resourceType: "networkpolicies",
        icon: KubeResourceIconMap.networkpolicies
      },
      {
        name: "Endpoint",
        description: "Track service endpoints",
        path: "network/endpoint.yaml",
        resourceType: "endpoints",
        icon: KubeResourceIconMap.endpoints
      }
    ]
  },
  {
    name: "configs",
    displayName: "Configuration",
    items: [
      {
        name: "ConfigMap",
        description: "Store non-confidential configuration data",
        path: "configs/configmap.yaml",
        resourceType: "configmaps",
        icon: KubeResourceIconMap.configmaps
      },
      {
        name: "Secret",
        description: "Store sensitive information",
        path: "configs/secret.yaml",
        resourceType: "secrets",
        icon: KubeResourceIconMap.secrets
      },
      {
        name: "Resource Quota",
        description: "Set limits on resource consumption",
        path: "configs/resourcequota.yaml",
        resourceType: "resourcequotas",
        icon: KubeResourceIconMap.resourcequotas
      },
      {
        name: "Limit Range",
        description: "Define default and limit resource constraints",
        path: "configs/limitranges.yaml",
        resourceType: "limitranges",
        icon: KubeResourceIconMap.limitranges
      },
      {
        name: "Horizontal Pod Autoscaler",
        description: "Automatically scale based on metrics",
        path: "configs/horizontalpodautoscaler.yaml",
        resourceType: "hpa",
        icon: KubeResourceIconMap.hpa
      },
      {
        name: "Pod Disruption Budget",
        description: "Maintain availability during disruptions",
        path: "configs/poddisruptionbudget.yaml",
        resourceType: "pdb",
        icon: KubeResourceIconMap.pdb
      },
      {
        name: "Priority Class",
        description: "Define pod scheduling priority",
        path: "configs/priorityclass.yaml",
        resourceType: "priorityclasses",
        icon: KubeResourceIconMap.priorityclasses
      },
      {
        name: "Runtime Class",
        description: "Select container runtime configuration",
        path: "configs/runtimeclass.yaml",
        resourceType: "runtime-classes",
        icon: KubeResourceIconMap["runtime-classes"]
      },
      {
        name: "Lease",
        description: "Distributed locking mechanism",
        path: "configs/lease.yaml",
        resourceType: "leases",
        icon: KubeResourceIconMap.leases
      }
    ]
  },
  {
    name: "storage",
    displayName: "Storage",
    items: [
      {
        name: "Persistent Volume Claim",
        description: "Request storage resources",
        path: "storage/persistentvolumeclaim.yaml",
        resourceType: "persistentvolumeclaims",
        icon: KubeResourceIconMap.persistentvolumeclaims
      },
      {
        name: "Persistent Volume",
        description: "Represent a piece of storage",
        path: "storage/persistentvolume.yaml",
        resourceType: "persistentvolumes",
        icon: KubeResourceIconMap.persistentvolumes
      },
      {
        name: "Storage Class",
        description: "Define storage provisioner and parameters",
        path: "storage/storageclass.yaml",
        resourceType: "storageclasses",
        icon: KubeResourceIconMap.storageclasses
      }
    ]
  },
  {
    name: "accesscontrol",
    displayName: "Access Control",
    items: [
      {
        name: "Service Account",
        description: "Identity for processes in pods",
        path: "accesscontrol/serviceaccount.yaml",
        resourceType: "serviceaccounts",
        icon: KubeResourceIconMap.serviceaccounts
      },
      {
        name: "Role",
        description: "Namespace-scoped role definitions",
        path: "accesscontrol/role.yaml",
        resourceType: "roles",
        icon: KubeResourceIconMap.roles
      },
      {
        name: "Role Binding",
        description: "Bind roles to users in a namespace",
        path: "accesscontrol/rolebinding.yaml",
        resourceType: "rolebindings",
        icon: KubeResourceIconMap.rolebindings
      },
      {
        name: "Cluster Role",
        description: "Cluster-wide role definitions",
        path: "accesscontrol/clusterrole.yaml",
        resourceType: "clusterroles",
        icon: KubeResourceIconMap.clusterroles
      },
      {
        name: "Cluster Role Binding",
        description: "Bind cluster roles to users",
        path: "accesscontrol/clusterrolebinding.yaml",
        resourceType: "clusterrolebindings",
        icon: KubeResourceIconMap.clusterrolebindings
      }
    ]
  },
  {
    name: "other",
    displayName: "Cluster Management",
    items: [
      {
        name: "Namespace",
        description: "Create an isolated environment",
        path: "namespace.yaml",
        resourceType: "namespaces",
        icon: KubeResourceIconMap.namespaces
      }
    ]
  }
];