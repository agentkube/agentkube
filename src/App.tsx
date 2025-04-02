
// import { invoke } from "@tauri-apps/api/tauri";

import { Menu } from "@/components/menu"

// import { TailwindIndicator } from "./components/tailwind-indicator"
import { ThemeProvider } from "./components/theme-provider"
import { cn } from "./lib/utils"
import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/home.pages';
import { Appearance, BestPractices, Dashboard, GeneralSettings, Kubeconfig, Settings, Shortcuts, Support, VulnerabilityReport, MonitoringOverview, CostOverview, Overview, AIEditor, AIResourceEditor, ModelConfiguration, HelmCharts, HelmReleases, ChartsView, Talk2cluster, MCPServerConfig, Account } from '@/pages';
import { Footer, Spotlight } from '@/components/custom';
import { DrawerProvider } from '@/contexts/useDrawer';
import { ClusterProvider } from '@/contexts/clusterContext';
import {
  Namespaces, Nodes,
  // Workloads 
  Deployments, Replicasets, ReplicationControllers, StatefulSets, Pods, CronJobs, Jobs, DaemonSets,
  // Storage
  PersistentVolumeClaims, PersistentVolumes, StorageClasses,
  // Network
  Services, Endpoints, Ingresses, IngressClasses, NetworkPolicies,
  // Config
  ConfigMaps, Secrets, ResourceQuotas, LimitRanges, HorizontalPodAutoscalers, VerticalPodAutoscalers, Leases, ValidatingWebhookConfigurations, PriorityClasses, RuntimeClasses, PodDisruptionBudgets,
  // Events
  Events,
  // AccessControler
  ServiceAccounts,
  Roles,
  ClusterRoleBindings,
  ClusterRoles,
  RoleBindings,
  MutatingWebhookConfigurations,

  // Viewer
  // Worloads
  DeploymentViewer,
  PodViewer,
  DaemonSetViewer,
  ReplicaSetViewer,
  ReplicationControllerViewer,
  StatefulSetViewer,
  CronJobViewer,
  JobViewer,

  // Network
  ServiceViewer,
  NodeViewer,
  NamespaceViewer,
  EventViewer,
  NetworkPolicyViewer,
  IngressClassViewer,
  IngressViewer,
  EndpointViewer,

  // Storage
  PersistentVolumeViewer,
  StorageClassViewer,
  PersistentVolumeClaimViewer,
  HorizontalPodAutoscalerViewer,
  ConfigMapViewer,
  SecretViewer,
  ResourceQuotaViewer,
  LimitRangeViewer,
  VerticalPodAutoscalerViewer,
  LeasesViewer,
  PodDisruptionBudgetViewer,
  MutatingWebhookConfigurationViewer,
  ValidatingWebhookConfigurationViewer,
  PriorityClassViewer,
  RuntimeClassViewer,
  ServiceAccountViewer,
  RoleViewer,
  RoleBindingViewer,
  ClusterRoleViewer,
  ClusterRoleBindingViewer,
  CustomResources,
  CustomResourceViewer,
  CustomResourceDefinitionViewer,
  Portforwards,
} from './pages/dashboard/cluster-resource';
import { NamespaceProvider } from './contexts/useNamespace';
import { Toaster } from "./components/ui/toaster";

function App() {

  // load theme from settings.json 

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <ClusterProvider>
        <DrawerProvider>
          <NamespaceProvider>

            <div className="h-screen overflow-clip">
              <Menu />
              <div className="flex-auto min-h-[calc(100vh-70px)]">
                <Spotlight />
                <Routes>
                  <Route path="/" element={<HomePage />} />

                  <Route path="/dashboard" element={<Dashboard />}>
                    <Route index element={<Overview />} />
                    <Route path="monitoring" element={<MonitoringOverview />} />
                    <Route path="cost" element={<CostOverview />} />

                    <Route path="editor" element={<AIResourceEditor />} />


                    <Route path="talk2cluster" element={<Talk2cluster />} />
                    <Route path="talk2cluster/:sessionId" element={<Talk2cluster />} />


                    <Route path="explore">
                      <Route path="nodes/:nodeName" element={<NodeViewer />} />
                      <Route path="namespaces/:namespaceName" element={<NamespaceViewer />} />
                      <Route path="events/:namespace/:eventName" element={<EventViewer />} />
                      <Route path="portforwards" element={<Portforwards />} />

                      <Route path="charts" element={<HelmCharts />} />
                      <Route path="releases" element={<HelmReleases />} />
                      <Route path="charts/:repo/:name" element={<ChartsView />} />



                      {/* Workload Viewer */}
                      <Route path="pods/:namespace/:podName" element={<PodViewer />} />
                      <Route path="deployments/:namespace/:deploymentName" element={<DeploymentViewer />} />
                      <Route path="daemonsets/:namespace/:daemonSetName" element={<DaemonSetViewer />} />
                      <Route path="replicationcontrollers/:namespace/:rcName" element={<ReplicationControllerViewer />} />
                      <Route path="replicasets/:namespace/:replicaSetName" element={<ReplicaSetViewer />} />
                      <Route path="statefulsets/:namespace/:statefulSetName" element={<StatefulSetViewer />} />
                      <Route path="cronjobs/:namespace/:cronJobName" element={<CronJobViewer />} />
                      <Route path="jobs/:namespace/:jobName" element={<JobViewer />} />

                      {/* Network Viewer */}
                      <Route path="services/:namespace/:serviceName" element={<ServiceViewer />} />
                      <Route path="endpoints/:namespace/:endpointName" element={<EndpointViewer />} />
                      <Route path="ingresses/:namespace/:ingressName" element={<IngressViewer />} />
                      <Route path="ingressclasses/:ingressClassName" element={<IngressClassViewer />} />
                      <Route path="networkpolicies/:namespace/:networkPolicyName" element={<NetworkPolicyViewer />} />

                      {/* Storage Viewer */}
                      <Route path="persistentvolumeclaims/:namespace/:pvcName" element={<PersistentVolumeClaimViewer />} />
                      <Route path="persistentvolumes/:pvName" element={<PersistentVolumeViewer />} />
                      <Route path="storageclasses/:storageClassName" element={<StorageClassViewer />} />

                      {/* Config */}
                      <Route path="configmaps/:namespace/:configMapName" element={<ConfigMapViewer />} />
                      <Route path="secrets/:namespace/:secretName" element={<SecretViewer />} />
                      <Route path="resourcequotas/:namespace/:resourceQuotaName" element={<ResourceQuotaViewer />} />
                      <Route path="limitranges/:namespace/:limitRangeName" element={<LimitRangeViewer />} />
                      <Route path="horizontalpodautoscalers/:namespace/:hpaName" element={<HorizontalPodAutoscalerViewer />} />
                      <Route path="verticalpodautoscalers/:namespace/:vpaName" element={<VerticalPodAutoscalerViewer />} />
                      <Route path="leases/:namespace/:leaseName" element={<LeasesViewer />} />
                      <Route path="poddisruptionbudgets/:namespace/:pdbName" element={<PodDisruptionBudgetViewer />} />
                      <Route path="mutatingwebhookconfigurations/:webhookName" element={<MutatingWebhookConfigurationViewer />} />
                      <Route path="validatingwebhookconfigurations/:webhookName" element={<ValidatingWebhookConfigurationViewer />} />
                      <Route path="priorityclasses/:priorityClassName" element={<PriorityClassViewer />} />
                      <Route path="runtimeclasses/:runtimeClassName" element={<RuntimeClassViewer />} />

                      {/* Access Control viewer */}
                      <Route path="serviceaccounts/:namespace/:serviceAccountName" element={<ServiceAccountViewer />} />
                      <Route path="roles/:namespace/:roleName" element={<RoleViewer />} />
                      <Route path="rolebindings/:namespace/:bindingName" element={<RoleBindingViewer />} />
                      <Route path="clusterroles/:clusterRoleName" element={<ClusterRoleViewer />} />
                      <Route path="clusterrolebindings/:bindingName" element={<ClusterRoleBindingViewer />} />

                      <Route path="customresources" element={<CustomResources />} />
                      <Route path="customresources/view/:namespace/:name" element={<CustomResourceViewer />} />
                      <Route path="customresources/view/:name" element={<CustomResourceViewer />} />
                      <Route path="customresourcedefinitions/:name" element={<CustomResourceDefinitionViewer />} />


                      {/* List Resources */}
                      <Route path="nodes" element={<Nodes />} />
                      <Route path="namespaces" element={<Namespaces />} />
                      <Route path="events" element={<Events />} />

                      {/* Workloads */}
                      <Route path="deployments" element={<Deployments />} />
                      <Route path="replicasets" element={<Replicasets />} />
                      <Route path="daemonsets" element={<DaemonSets />} />
                      <Route path="replicationcontrollers" element={<ReplicationControllers />} />
                      <Route path="statefulsets" element={<StatefulSets />} />
                      <Route path="pods" element={<Pods />} />
                      <Route path="jobs" element={<Jobs />} />
                      <Route path="cronjobs" element={<CronJobs />} />

                      {/* Network */}
                      <Route path="services" element={<Services />} />
                      <Route path="endpoints" element={<Endpoints />} />
                      <Route path="ingresses" element={<Ingresses />} />
                      <Route path="ingressclasses" element={<IngressClasses />} />
                      <Route path="networkpolicies" element={<NetworkPolicies />} />

                      {/* Storage */}
                      <Route path="persistentvolumeclaims" element={<PersistentVolumeClaims />} />
                      <Route path="persistentvolumes" element={<PersistentVolumes />} />
                      <Route path="storageclasses" element={<StorageClasses />} />

                      {/* Config */}
                      <Route path="configmaps" element={<ConfigMaps />} />
                      <Route path="secrets" element={<Secrets />} />
                      <Route path="resourcequotas" element={<ResourceQuotas />} />
                      <Route path="limitranges" element={<LimitRanges />} />
                      <Route path="horizontalpodautoscalers" element={<HorizontalPodAutoscalers />} />
                      <Route path="verticalpodautoscalers" element={<VerticalPodAutoscalers />} />
                      <Route path="leases" element={<Leases />} />
                      <Route path="mutatingwebhookconfigurations" element={<MutatingWebhookConfigurations />} />
                      <Route path="validatingwebhookconfigurations" element={<ValidatingWebhookConfigurations />} />
                      <Route path="priorityclasses" element={<PriorityClasses />} />
                      <Route path="runtimeclasses" element={<RuntimeClasses />} />
                      <Route path="poddisruptionbudgets" element={<PodDisruptionBudgets />} />

                      {/* Access Controls */}
                      <Route path="serviceaccounts" element={<ServiceAccounts />} />
                      <Route path="roles" element={<Roles />} />
                      <Route path="rolebindings" element={<RoleBindings />} />
                      <Route path="clusterroles" element={<ClusterRoles />} />
                      <Route path="clusterrolebindings" element={<ClusterRoleBindings />} />

                      {/* Custom Resource */}



                    </Route>

                    <Route path="security">
                      <Route path="vulnerability-report" element={<VulnerabilityReport />} />
                      <Route path="best-practices" element={<BestPractices />} />
                    </Route>

                  </Route>

                  {/* Settings Routes */}
                  <Route path="/settings" element={<Settings />}>
                    <Route path="general" element={<GeneralSettings />} />
                    <Route path="appearance" element={<Appearance />} />
                    <Route path="shortcuts" element={<Shortcuts />} />
                    <Route path="kubeconfig" element={<Kubeconfig />} />
                    <Route path="models" element={<ModelConfiguration />} />
                    <Route path="support" element={<Support />} />
                    <Route path="mcp" element={<MCPServerConfig />} />
                    <Route path="account" element={<Account />} />
                    <Route index element={<GeneralSettings />} />
                  </Route>
                </Routes>
              </div>
              <Toaster />
              <Footer />
            </div>
            {/* <TailwindIndicator /> */}
          </NamespaceProvider>
        </DrawerProvider>
      </ClusterProvider>
    </ThemeProvider>
  )
}

export default App
