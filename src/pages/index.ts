
// Settings
export { default as Settings } from './settings/settings.pages';
export { default as GeneralSettings } from './settings/general/general.pages';
export { default as Appearance } from './settings/appearance/appearance.pages';
export { default as Shortcuts } from './settings/shortcuts/shortcuts.pages';
export { default as Kubeconfig } from './settings/kubeconfig/kubeconfig.pages';
export { default as ModelConfiguration } from './settings/models/models.pages';
export { default as MCPServerConfig } from './settings/mcp/mcp.pages';
export { default as Account } from './settings/account/account.pages';
export { default as Updates } from './settings/updates/updates.pages';

// Dashboard
export { default as Dashboard } from './dashboard/dashboard.pages';
export { default as Overview } from './dashboard/overview.pages';
export { default as Support } from './settings/support/support.pages';
export { default as AIEditor } from './dashboard/editor/editor.pages';
export { default as AIResourceEditor } from './dashboard/editor/aieditor/aieditor.pages';
export { default as HelmCharts } from './dashboard/helm/charts.pages';
export { default as HelmReleases } from './dashboard/helm/releases.pages';
export { default as ChartsView } from './dashboard/helm/view/charts-view.pages';
export { default as Talk2cluster } from './dashboard/talk2cluster/talk2cluster.pages';
export { default as Runbooks } from './dashboard/runbooks/runbooks.pages';
export { default as Investigation } from './dashboard/investigations/investigation.pages';
export { default as ClusterReport } from './dashboard/cluster-report/cluster-report.pages';

// Security
export { default as VulnerabilityReport } from './dashboard/security/vulnerability-report.pages';
export { default as BestPractices } from './dashboard/security/best-practices.pages';

// Monitoring
export { default as MonitoringOverview } from './dashboard/monitoring/monitoring-overview.pages';
export { default as CostOverview } from './dashboard/cost/cost-overview.pages';
export { default as LLMComparison } from './dashboard/cost/ai-optimizers/llm-comparision.component';
export { default as ModelCompare } from './dashboard/cost/ai-optimizers/model-compare.component';
export { default as DrillDown } from './dashboard/monitoring/drilldown.pages';