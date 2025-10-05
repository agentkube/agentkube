import React from 'react';
import { useLocation, useParams } from 'react-router-dom';

export const HeaderComponent: React.FC = () => {
  const location = useLocation();
  const params = useParams();

  const getPageTitle = (): string => {
    const pathname = location.pathname;

    // Handle root/home
    if (pathname === '/') {
      return '';
    }

    // Handle settings routes
    if (pathname.startsWith('/settings')) {
      if (pathname.includes('/general')) return 'General';
      if (pathname.includes('/appearance')) return 'Appearance';
      if (pathname.includes('/shortcuts')) return 'Shortcuts';
      if (pathname.includes('/kubeconfig')) return 'Kubeconfig';
      if (pathname.includes('/models')) return 'Models';
      if (pathname.includes('/support')) return 'Support';
      if (pathname.includes('/mcp')) return 'MCP Server';
      if (pathname.includes('/networks')) return 'Network Diagnosis';
      if (pathname.includes('/account')) return 'Account';
      if (pathname.includes('/updates')) return 'Updates';
      if (pathname.includes('/imagescans')) return 'Image Scans';
      if (pathname.includes('/watcher')) return 'Watcher';
      if (pathname.includes('/indexing')) return 'Indexing';
      return 'Settings';
    }

    // Handle dashboard routes
    if (pathname.startsWith('/dashboard')) {
      // Overview/main dashboard
      if (pathname === '/dashboard') {
        return 'Overview';
      }

      // Monitoring routes
      if (pathname.includes('/monitoring')) {
        if (pathname.includes('/drilldown')) {
          return 'Monitoring - Drill Down';
        }
        return 'Monitoring';
      }

      // Other dashboard sub-routes
      if (pathname.includes('/cluster-report')) return 'Cluster Report';
      if (pathname.includes('/runbooks')) return 'Runbooks';
      if (pathname.includes('/investigations')) return 'Investigations';
      if (pathname.includes('/cost')) return 'Cost Overview';
      if (pathname.includes('/llm-comparison')) {
        if (pathname.includes('/compare')) return 'LLM Comparison - Compare';
        return 'LLM Comparison';
      }
      if (pathname.includes('/editor')) return 'AI Resource Editor';
      if (pathname.includes('/talk2cluster')) {
        if (params.sessionId) return `Talk to Cluster - Session ${params.sessionId}`;
        return 'Talk to Cluster';
      }

      // Security routes
      if (pathname.includes('/security')) {
        if (pathname.includes('/vulnerability-report')) return 'Vulnerability Report';
        if (pathname.includes('/audit-report')) return 'Audit Report';
        return 'Security';
      }

      // Explore/Resource routes
      if (pathname.includes('/explore')) {
        // Workloads
        if (pathname.includes('/pods')) {
          // Check if this is a specific pod view (has namespace and podName in path)
          const podPathMatch = pathname.match(/\/pods\/([^\/]+)\/([^\/]+)/);
          if (podPathMatch) {
            const [, , podName] = podPathMatch;
            return `Pod - ${podName}`;
          }
          return 'Pods';
        }
        if (pathname.includes('/deployments')) {
          const deploymentPathMatch = pathname.match(/\/deployments\/([^\/]+)\/([^\/]+)/);
          if (deploymentPathMatch) {
            const [, , deploymentName] = deploymentPathMatch;
            return `Deployment - ${deploymentName}`;
          }
          return 'Deployments';
        }
        if (pathname.includes('/daemonsets')) {
          const match = pathname.match(/\/daemonsets\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `DaemonSets - ${resourceName}`;
          }
          return 'DaemonSets';
        }
        if (pathname.includes('/replicasets')) {
          const match = pathname.match(/\/replicasets\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `ReplicaSet - ${resourceName}`;
          }
          return 'ReplicaSets';
        }
        if (pathname.includes('/replicationcontrollers')) {
          const match = pathname.match(/\/replicationcontrollers\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Replication Controllers - ${resourceName}`;
          }
          return 'Replication Controllers';
        }
        if (pathname.includes('/statefulsets')) {
          const match = pathname.match(/\/statefulsets\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `StatefulSets - ${resourceName}`;
          }
          return 'StatefulSets';
        }
        if (pathname.includes('/cronjobs')) {
          const match = pathname.match(/\/cronjobs\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `CronJob - ${resourceName}`;
          }
          return 'CronJobs';
        }
        if (pathname.includes('/jobs')) {
          const match = pathname.match(/\/jobs\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Job - ${resourceName}`;
          }
          return 'Jobs';
        }

        // Network
        if (pathname.includes('/services')) {
          const match = pathname.match(/\/services\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Service - ${resourceName}`;
          }
          return 'Services';
        }
        if (pathname.includes('/endpoints')) {
          const match = pathname.match(/\/endpoints\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Endpoints - ${resourceName}`;
          }
          return 'Endpoints';
        }
        if (pathname.includes('/ingresses')) {
          const match = pathname.match(/\/ingresses\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Ingress - ${resourceName}`;
          }
          return 'Ingresses';
        }
        if (pathname.includes('/ingressclasses')) {
          const match = pathname.match(/\/ingressclasses\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `Ingress Class - ${resourceName}`;
          }
          return 'Ingress Classes';
        }
        if (pathname.includes('/networkpolicies')) {
          const match = pathname.match(/\/networkpolicies\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Network Policies - ${resourceName}`;
          }
          return 'Network Policies';
        }

        // Storage
        if (pathname.includes('/persistentvolumeclaims')) {
          const match = pathname.match(/\/persistentvolumeclaims\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `PVCs - ${resourceName}`;
          }
          return 'Persistent Volume Claims';
        }
        if (pathname.includes('/persistentvolumes')) {
          const match = pathname.match(/\/persistentvolumes\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `PVs - ${resourceName}`;
          }
          return 'Persistent Volume';
        }
        if (pathname.includes('/storageclasses')) {
          const match = pathname.match(/\/storageclasses\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `Storage Class - ${resourceName}`;
          }
          return 'Storage Classes';
        }

        // Config & Other Resources
        if (pathname.includes('/configmaps')) {
          const match = pathname.match(/\/configmaps\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `ConfigMap - ${resourceName}`;
          }
          return 'ConfigMaps';
        }
        if (pathname.includes('/secrets')) {
          const match = pathname.match(/\/secrets\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Secret - ${resourceName}`;
          }
          return 'Secrets';
        }
        if (pathname.includes('/resourcequotas')) {
          const match = pathname.match(/\/resourcequotas\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Resource Quota - ${resourceName}`;
          }
          return 'Resource Quotas';
        }
        if (pathname.includes('/limitranges')) {
          const match = pathname.match(/\/limitranges\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Limit Ranges - ${resourceName}`;
          }
          return 'Limit Ranges';
        }
        if (pathname.includes('/horizontalpodautoscalers')) {
          const match = pathname.match(/\/horizontalpodautoscalers\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `HPA - ${resourceName}`;
          }
          return 'Horizontal Pod Autoscalers';
        }
        if (pathname.includes('/verticalpodautoscalers')) {
          const match = pathname.match(/\/verticalpodautoscalers\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `VPA - ${resourceName}`;
          }
          return 'Vertical Pod Autoscalers';
        }

        // Cluster Resources
        if (pathname.includes('/nodes')) {
          const match = pathname.match(/\/nodes\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `Node - ${resourceName}`;
          }
          return 'Nodes';
        }
        if (pathname.includes('/namespaces')) {
          const match = pathname.match(/\/namespaces\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `Namespace - ${resourceName}`;
          }
          return 'Namespaces';
        }
        if (pathname.includes('/events')) {
          const match = pathname.match(/\/events\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Event - ${resourceName}`;
          }
          return 'Events';
        }

        // Access Control
        if (pathname.includes('/serviceaccounts')) {
          const match = pathname.match(/\/serviceaccounts\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Service Account - ${resourceName}`;
          }
          return 'Service Accounts';
        }
        if (pathname.includes('/roles')) {
          const match = pathname.match(/\/roles\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Roles - ${resourceName}`;
          }
          return 'Roles';
        }
        if (pathname.includes('/rolebindings')) {
          const match = pathname.match(/\/rolebindings\/([^\/]+)\/([^\/]+)/);
          if (match) {
            const [, , resourceName] = match;
            return `Role Binding - ${resourceName}`;
          }
          return 'Role Bindings';
        }
        if (pathname.includes('/clusterroles')) {
          const match = pathname.match(/\/clusterroles\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `Cluster Role - ${resourceName}`;
          }
          return 'Cluster Roles';
        }
        if (pathname.includes('/clusterrolebindings')) {
          const match = pathname.match(/\/clusterrolebindings\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `Cluster Role Binding - ${resourceName}`;
          }
          return 'Cluster Role Bindings';
        }

        // Custom Resources
        if (pathname.includes('/customresources')) {
          const match = pathname.match(/\/customresources\/view\/([^\/]+)\/([^\/]+)/) || pathname.match(/\/customresources\/view\/([^\/]+)/);
          if (match) {
            const resourceName = match[2] || match[1];
            return `CustomResource - ${resourceName}`;
          }
          return 'Custom Resources';
        }
        if (pathname.includes('/customresourcedefinitions')) {
          const match = pathname.match(/\/customresourcedefinitions\/([^\/]+)/);
          if (match) {
            const [, resourceName] = match;
            return `CRDs - ${resourceName}`;
          }
          return 'Custom Resource Definitions';
        }

        // Helm
        if (pathname.includes('/charts')) {
          if (params.name) return `Helm Charts - ${params.name}`;
          return 'Helm Charts';
        }
        if (pathname.includes('/releases')) {
          return 'Helm Releases';
        }

        // Port Forwards
        if (pathname.includes('/portforwards')) {
          return 'Port Forwards';
        }

        return 'Explore';
      }

      return 'Dashboard';
    }

    // Fallback for unknown routes
    return 'Unknown';
  };

  const title = getPageTitle();

  return (
    <div className="text-sm text-gray-900 dark:text-gray-300/50">
      {title.includes(' - ') ? (
        <span>
          {title.split(' - ')[0]} <span className="text-gray-600 dark:text-gray-400">{title.split(' - ')[1]}</span>
        </span>
      ) : (
        title
      )}
    </div>
  );
};

export default HeaderComponent;