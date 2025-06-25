// data.ts
import React from 'react';
import {
  Cpu,
  Settings,
  Network,
  Database,
  Shield,
  Box,
  Activity,
  // Command,
  Clock,
  Server,
  Share2,
  Layers,
  Timer,
  ShieldAlert,
  Gauge,
  Scale,
  AlertCircle,
  FileCode,
  Webhook,
  RouterIcon,
  HardDrive,
  FolderTree,
  Bell,
  FileVolume,
  Folder,
  // Ship,
  // List,
  Users,
  Key,
  Lock,
  UserCheck,
  Puzzle,
  Ship,
  List,
  Boxes,
  Plug
} from 'lucide-react';
import { SiHelm } from '@icons-pack/react-simple-icons';
export const sidebarItems = [
  {
    id: 'nodes',
    label: 'Nodes',
    icon: <Server className="w-4 h-4" />
  },
  {
    id: 'namespaces',
    label: 'Namespaces',
    icon: <FolderTree className="w-4 h-4" />
  },
  {
    id: 'events',
    label: 'Events',
    icon: <Bell className="w-4 h-4" />
  },
  {
    id: 'workloads',
    label: 'Workloads',
    icon: <Boxes className="w-4 h-4" />,
    children: [
      { id: 'pods', label: 'Pods', icon: <Box className="w-4 h-4" /> },
      { id: 'deployments', label: 'Deployments', icon: <Share2 className="w-4 h-4" /> },
      { id: 'daemonsets', label: 'Daemon Sets', icon: <Boxes className="w-4 h-4" /> },
      { id: 'statefulsets', label: 'Stateful Sets', icon: <Database className="w-4 h-4" /> },
      { id: 'replicasets', label: 'Replica Sets', icon: <Layers className="w-4 h-4" /> },
      { id: 'replicationcontrollers', label: 'Replication Controllers', icon: <Activity className="w-4 h-4" /> },
      { id: 'jobs', label: 'Jobs', icon: <Activity className="w-4 h-4" /> },
      { id: 'cronjobs', label: 'Cron Jobs', icon: <Clock className="w-4 h-4" /> },
    ]
  },
  {
    id: 'config',
    label: 'Config',
    icon: <Settings className="w-4 h-4" />,
    children: [
      { id: 'configmaps', label: 'Config Maps', icon: <FileCode className="w-4 h-4" /> },
      { id: 'secrets', label: 'Secrets', icon: <Shield className="w-4 h-4" /> },
      { id: 'resourcequotas', label: 'Resource Quotas', icon: <Gauge className="w-4 h-4" /> },
      { id: 'limitranges', label: 'Limit Ranges', icon: <AlertCircle className="w-4 h-4" /> },
      { id: 'horizontalpodautoscalers', label: 'Horizontal Pod Autoscalers', icon: <Scale className="w-4 h-4" /> },
      { id: 'verticalpodautoscalers', label: 'Vertical Pod Autoscalers', icon: <Scale className="w-4 h-4" /> },
      { id: 'poddisruptionbudgets', label: 'Pod Disruption Budgets', icon: <ShieldAlert className="w-4 h-4" /> },
      { id: 'priorityclasses', label: 'Priority Classes', icon: <Layers className="w-4 h-4" /> },
      { id: 'runtimeclasses', label: 'Runtime Classes', icon: <Timer className="w-4 h-4" /> },
      { id: 'leases', label: 'Leases', icon: <Timer className="w-4 h-4" /> },
      { id: 'mutatingwebhookconfigurations', label: 'Mutating Webhook Configs', icon: <Webhook className="w-4 h-4" /> },
      { id: 'validatingwebhookconfigurations', label: 'Validating Webhook Configs', icon: <Webhook className="w-4 h-4" /> },
    ]
  },
  {
    id: 'network',
    label: 'Network',
    icon: <Network className="w-4 h-4" />,
    children: [
      { id: 'services', label: 'Services', icon: <Activity className="w-4 h-4" /> },
      { id: 'endpoints', label: 'Endpoints', icon: <Share2 className="w-4 h-4" /> },
      { id: 'ingresses', label: 'Ingresses', icon: <RouterIcon className="w-4 h-4" /> },
      { id: 'ingressclasses', label: 'Ingress Classes', icon: <RouterIcon className="w-4 h-4" /> },
      { id: 'networkpolicies', label: 'Network Policies', icon: <Shield className="w-4 h-4" /> }
    ]
  },
  {
    id: 'storage',
    label: 'Storage',
    icon: <HardDrive className="w-4 h-4" />,
    children: [
      { id: 'persistentvolumeclaims', label: 'Persistent Volume Claims', icon: <FileVolume className="w-4 h-4" /> },
      { id: 'persistentvolumes', label: 'Persistent Volumes', icon: <HardDrive className="w-4 h-4" /> },
      { id: 'storageclasses', label: 'Storage Classes', icon: <Folder className="w-4 h-4" /> },
    ]
  },
  {
    id: 'helm',
    label: 'Helm',
    icon: <SiHelm className="w-4 h-4" />,
    children: [
      { id: 'charts', label: 'Charts', icon: <List className="w-4 h-4" /> },
      { id: 'releases', label: 'Releases', icon: <Box className="w-4 h-4" /> },
    ]
  },
  {
    id: 'accesscontrol',
    label: 'Access Control',
    icon: <Shield className="w-4 h-4" />,
    children: [
      {
        id: 'serviceaccounts',
        label: 'Service Accounts',
        icon: <Users className="w-4 h-4" />
      },
      {
        id: 'clusterroles',
        label: 'Cluster Roles',
        icon: <Key className="w-4 h-4" />,
      },
      {
        id: 'roles',
        label: 'Roles',
        icon: <Lock className="w-4 h-4" />,
      },
      {
        id: 'clusterrolebindings',
        label: 'Cluster Role Bindings',
        icon: <UserCheck className="w-4 h-4" />,
      },
      {
        id: 'rolebindings',
        label: 'Role Bindings',
        icon: <UserCheck className="w-4 h-4" />,
      },
    ]
  },
  {
    id: 'portforwards',
    label: 'Port Forwards',
    icon: <Plug className="w-4 h-4" />,
  },
  {
    id: 'customresources',
    label: 'Custom Resources',
    icon: <Puzzle className="w-4 h-4" />,
  }
];