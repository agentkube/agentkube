import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SiArgo } from '@icons-pack/react-simple-icons';
import { Settings, RefreshCw, ChevronDown, Check, GitBranch, Package, Activity, Search, Play, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCluster } from '@/contexts/clusterContext';
import { useToast } from '@/hooks/use-toast';
import { kubeProxyRequest } from '@/api/cluster';
import { getClusterConfig, updateClusterConfig } from '@/api/settings';
import { ProxyConfigDialog } from '@/components/custom';
import ArgoApplicationCard from './components/argo-applications.component';
import ArgoApplicationDrawer from './components/argo-application-drawer.component';
import {
  ArgoApplication,
  ArgoApplicationList,
  ArgoProject,
  ArgoProjectList,
  ArgoConfig,
  ArgoStats,
} from '@/types/argocd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import DemoVideoDialog from '@/components/custom/demovideodialog/demovideodialog.component';
import { DEMO_VIDEOS } from '@/constants/demo.constants';
import IntegrationLookupDialog from '../integrationlookup-dialog.component';

const ArgoCDView = () => {
  const { currentContext } = useCluster();
  const { toast } = useToast();

  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState<boolean>(false);
  const [applications, setApplications] = useState<ArgoApplication[]>([]);
  const [projects, setProjects] = useState<ArgoProject[]>([]);
  const [stats, setStats] = useState<ArgoStats>({
    totalApplications: 0,
    syncedApplications: 0,
    healthyApplications: 0,
    outOfSyncApplications: 0,
    degradedApplications: 0,
    progressingApplications: 0,
    totalProjects: 0,
    totalApplicationSets: 0,
  });

  const [argoConfig, setArgoConfig] = useState<ArgoConfig>({
    namespace: 'argocd',
    service: 'argocd-server:80',
  });

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [syncFilter, setSyncFilter] = useState<string>('All');
  const [healthFilter, setHealthFilter] = useState<string>('All');
  const [projectFilter, setProjectFilter] = useState<string>('All');
  const [isWatchDemoExpanded, setIsWatchDemoExpanded] = useState<boolean>(false);
  const [isDemoOpen, setIsDemoOpen] = useState<boolean>(false);
  const [selectedApplication, setSelectedApplication] = useState<ArgoApplication | null>(null);
  const [isLookupDialogOpen, setIsLookupDialogOpen] = useState<boolean>(false);

  // Load ArgoCD configuration
  const loadArgoConfig = useCallback(async () => {
    if (!currentContext) return;

    try {
      const clusterConfig = await getClusterConfig(currentContext.name);
      if (clusterConfig.config?.argocd) {
        const argoCDConfig = clusterConfig.config.argocd;
        const config = {
          namespace: argoCDConfig.namespace || 'argocd',
          service: argoCDConfig.service_address || argoCDConfig.service || 'argocd-server:80',
        };
        setArgoConfig(config);

        // Also update localStorage to keep it in sync
        const configToSave = {
          externalConfig: {
            argocd: config,
          },
        };
        localStorage.setItem(`${currentContext.name}.argocdConfig`, JSON.stringify(configToSave));
        return;
      }
    } catch (clusterError) {
      console.log('No cluster config found, falling back to localStorage:', clusterError);
    }

    // Fallback to localStorage if cluster config not available
    const savedConfig = localStorage.getItem(`${currentContext.name}.argocdConfig`);
    if (savedConfig) {
      const parsedConfig = JSON.parse(savedConfig);
      if (parsedConfig.externalConfig?.argocd) {
        setArgoConfig(parsedConfig.externalConfig.argocd);
      }
    }
  }, [currentContext]);

  const handleSaveConfig = async (config: { namespace: string; service: string }) => {
    if (!currentContext) return;

    setArgoConfig(config);

    try {
      // Save to cluster configuration
      const argoCDConfig = {
        namespace: config.namespace,
        service_address: config.service,
      };

      await updateClusterConfig(currentContext.name, {
        argocd: argoCDConfig,
      });

      // Also save to localStorage for caching
      const configKey = `${currentContext.name}.argocdConfig`;
      const configToSave = {
        externalConfig: {
          argocd: config,
        },
      };
      localStorage.setItem(configKey, JSON.stringify(configToSave));

      toast({
        title: 'Configuration Saved',
        description: `ArgoCD configuration saved for cluster ${currentContext.name}`,
      });
    } catch (err) {
      console.error('Error saving ArgoCD config:', err);
      toast({
        title: 'Error',
        description: 'Failed to save ArgoCD configuration',
        variant: 'destructive',
      });

      // Still save to localStorage as fallback
      try {
        const configKey = `${currentContext.name}.argocdConfig`;
        const configToSave = {
          externalConfig: {
            argocd: config,
          },
        };
        localStorage.setItem(configKey, JSON.stringify(configToSave));
      } catch (localErr) {
        console.error('Error saving to localStorage:', localErr);
      }
    }
  };

  // Fetch ArgoCD Applications
  const fetchApplications = useCallback(async () => {
    if (!currentContext || !argoConfig.namespace || !argoConfig.service) return;

    try {
      const servicePath = `apis/argoproj.io/v1alpha1/applications`;
      const response = await kubeProxyRequest(currentContext.name, servicePath, 'GET');

      if (response && response.items) {
        const appList = response as ArgoApplicationList;
        setApplications(appList.items);

        // Calculate stats
        const totalApps = appList.items.length;
        const synced = appList.items.filter((app) => app.status?.sync?.status === 'Synced').length;
        const healthy = appList.items.filter((app) => app.status?.health?.status === 'Healthy').length;
        const outOfSync = appList.items.filter((app) => app.status?.sync?.status === 'OutOfSync').length;
        const degraded = appList.items.filter((app) => app.status?.health?.status === 'Degraded').length;
        const progressing = appList.items.filter((app) => app.status?.health?.status === 'Progressing').length;

        setStats((prev) => ({
          ...prev,
          totalApplications: totalApps,
          syncedApplications: synced,
          healthyApplications: healthy,
          outOfSyncApplications: outOfSync,
          degradedApplications: degraded,
          progressingApplications: progressing,
        }));
      }
    } catch (err) {
      console.error('Error fetching ArgoCD applications:', err);
      toast({
        title: 'Error',
        description: 'Failed to fetch ArgoCD applications. Please check your configuration.',
        variant: 'destructive',
      });
    }
  }, [currentContext, argoConfig, toast]);

  // Fetch ArgoCD Projects
  const fetchProjects = useCallback(async () => {
    if (!currentContext || !argoConfig.namespace || !argoConfig.service) return;

    try {
      const servicePath = `apis/argoproj.io/v1alpha1/appprojects`;
      const response = await kubeProxyRequest(currentContext.name, servicePath, 'GET');

      if (response && response.items) {
        const projectList = response as ArgoProjectList;
        setProjects(projectList.items);

        setStats((prev) => ({
          ...prev,
          totalProjects: projectList.items.length,
        }));
      }
    } catch (err) {
      console.error('Error fetching ArgoCD projects:', err);
    }
  }, [currentContext, argoConfig]);

  // Load config on mount
  useEffect(() => {
    if (currentContext) {
      loadArgoConfig();
    }
  }, [currentContext, loadArgoConfig]);

  // Fetch data when config is loaded
  useEffect(() => {
    if (currentContext && argoConfig.namespace && argoConfig.service) {
      fetchApplications();
      fetchProjects();
    }
  }, [currentContext, argoConfig, fetchApplications, fetchProjects]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([fetchApplications(), fetchProjects()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Filter applications
  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      searchQuery === '' ||
      app.metadata.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.spec.project.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.spec.source.repoURL.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSyncFilter =
      syncFilter === 'All' || app.status?.sync?.status === syncFilter;

    const matchesHealthFilter =
      healthFilter === 'All' || app.status?.health?.status === healthFilter;

    const matchesProjectFilter =
      projectFilter === 'All' || app.spec.project === projectFilter;

    return matchesSearch && matchesSyncFilter && matchesHealthFilter && matchesProjectFilter;
  });

  // Watch Demo button animation
  useEffect(() => {
    const expandTimer = setTimeout(() => {
      setIsWatchDemoExpanded(true);
    }, 500);

    const collapseTimer = setTimeout(() => {
      setIsWatchDemoExpanded(false);
    }, 3000);

    return () => {
      clearTimeout(expandTimer);
      clearTimeout(collapseTimer);
    };
  }, []);

  return (
    <div
      className="
        max-h-[93vh] overflow-y-auto
        [&::-webkit-scrollbar]:w-1.5
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50"
    >
      <div className="p-6 mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">
              ArgoCD
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Watch Demo Button */}
            <Button
              onClick={() => setIsDemoOpen(true)}
              className="flex items-center justify-between gap-2 relative overflow-hidden"
            >
              <motion.div
                initial={{ width: 40 }}
                animate={{
                  width: isWatchDemoExpanded ? 144 : 14,
                }}
                transition={{
                  duration: 0.4,
                  ease: 'easeInOut',
                }}
                className="flex items-center justify-between gap-2"
              >
                <Play className="w-4 h-4 flex-shrink-0" />
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{
                    opacity: isWatchDemoExpanded ? 1 : 0,
                    width: isWatchDemoExpanded ? 'auto' : 0,
                  }}
                  transition={{
                    duration: 0.3,
                    delay: isWatchDemoExpanded ? 0.2 : 0,
                    ease: 'easeOut',
                  }}
                  className="whitespace-nowrap text-sm overflow-hidden"
                >
                  Watch Demo
                </motion.span>
              </motion.div>
            </Button>

            {/* Open Dashboard Button */}
            <Button
              variant="outline"
              onClick={() => setIsLookupDialogOpen(true)}
              className="flex items-center justify-between gap-2 w-44"
            >
              <SiArgo className="h-4 w-4" />
              <span className="text-xs flex items-center gap-1">Open Dashboard <ArrowUpRight className="h-4 w-4" /></span>
            </Button>

            {/* Refresh Button */}
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 text-gray-600 dark:text-gray-300 ${
                  isRefreshing ? 'animate-spin' : ''
                }`}
              />
            </Button>

            {/* Settings Button */}
            <Button
              variant="outline"
              onClick={() => setIsConfigDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <Settings className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4">
          {/* Total Applications */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4">
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2">
              TOTAL APPLICATIONS
            </div>
            <div className="text-4xl font-light text-black dark:text-white">
              {stats.totalApplications}
            </div>
          </div>

          {/* Synced Applications */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4">
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2 flex justify-between items-center">
              SYNCED
              <div className="text-green-500">●</div>
            </div>
            <div className="text-4xl font-light text-green-500">
              {stats.syncedApplications}
            </div>
            <div className="text-gray-800 dark:text-gray-400 text-xs mt-1">
              {stats.outOfSyncApplications} out of sync
            </div>
          </div>

          {/* Healthy Applications */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4">
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2 flex justify-between items-center">
              HEALTHY
              <Activity className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-4xl font-light text-green-500">
              {stats.healthyApplications}
            </div>
            <div className="text-gray-800 dark:text-gray-400 text-xs mt-1">
              {stats.degradedApplications} degraded
            </div>
          </div>

          {/* Projects */}
          <div className="bg-gray-200/30 dark:bg-gray-800/20 rounded-lg p-4">
            <div className="text-gray-800 dark:text-gray-400 text-xs mb-2">PROJECTS</div>
            <div className="text-4xl font-light text-black dark:text-white">
              {stats.totalProjects}
            </div>
            <div className="text-gray-800 dark:text-gray-400 text-xs mt-1">
              {stats.progressingApplications} progressing
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search applications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-7"
            />
          </div>

          {/* Sync Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <span className="text-xs">{syncFilter}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-200 dark:bg-[#0B0D13] backdrop-blur-sm">
              {['All', 'Synced', 'OutOfSync', 'Unknown'].map((filter) => (
                <DropdownMenuItem
                  key={filter}
                  onClick={() => setSyncFilter(filter)}
                  className="flex items-center justify-between"
                >
                  <span className="text-xs">{filter}</span>
                  {syncFilter === filter && <Check className="h-4 w-4 text-blue-500" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Health Status Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="text-xs">{healthFilter}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-200 dark:bg-[#0B0D13] backdrop-blur-sm">
              {['All', 'Healthy', 'Progressing', 'Degraded', 'Suspended', 'Missing', 'Unknown'].map(
                (filter) => (
                  <DropdownMenuItem
                    key={filter}
                    onClick={() => setHealthFilter(filter)}
                    className="flex items-center justify-between"
                  >
                    <span className="text-xs">{filter}</span>
                    {healthFilter === filter && <Check className="h-4 w-4 text-blue-500" />}
                  </DropdownMenuItem>
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Project Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                <span className="text-xs">{projectFilter}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-200 dark:bg-[#0B0D13] backdrop-blur-sm">
              <DropdownMenuItem
                onClick={() => setProjectFilter('All')}
                className="flex items-center justify-between"
              >
                <span className="text-xs">All</span>
                {projectFilter === 'All' && <Check className="h-4 w-4 text-blue-500" />}
              </DropdownMenuItem>
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.metadata.name}
                  onClick={() => setProjectFilter(project.metadata.name)}
                  className="flex items-center justify-between"
                >
                  <span className="text-xs">{project.metadata.name}</span>
                  {projectFilter === project.metadata.name && (
                    <Check className="h-4 w-4 text-blue-500" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Applications Grid */}
        {filteredApplications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500 dark:text-gray-400">
            <SiArgo className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium">No applications found</p>
            <p className="text-sm mt-2">
              {applications.length === 0
                ? 'Configure ArgoCD to get started'
                : 'Try adjusting your filters or search query'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredApplications.map((app) => (
              <ArgoApplicationCard
                key={`${app.metadata.namespace}-${app.metadata.name}`}
                application={app}
                onClick={() => setSelectedApplication(app)}
              />
            ))}
          </div>
        )}

        {/* Config Dialog */}
        <ProxyConfigDialog
          isOpen={isConfigDialogOpen}
          onClose={() => setIsConfigDialogOpen(false)}
          onSave={handleSaveConfig}
          defaultConfig={argoConfig}
          serviceName="ArgoCD"
          serviceDescription="Configure the ArgoCD server connection details for managing GitOps applications."
          defaultNamespace="argocd"
          defaultService="argocd-server:80"
        />

        {/* Demo Dialog */}
        <DemoVideoDialog
          isOpen={isDemoOpen}
          onClose={() => setIsDemoOpen(false)}
          videoUrl={DEMO_VIDEOS.MONITORING_DEMO.videoUrl}
          title="ArgoCD Integration Demo"
        />

        {/* Application Details Drawer */}
        <ArgoApplicationDrawer
          application={selectedApplication}
          isOpen={selectedApplication !== null}
          onClose={() => setSelectedApplication(null)}
        />

        {/* Integration Lookup Dialog */}
        <IntegrationLookupDialog
          isOpen={isLookupDialogOpen}
          onClose={() => setIsLookupDialogOpen(false)}
          clusterName={currentContext?.name || ''}
          toolName="argocd"
          toolDisplayName="ArgoCD"
          toolIcon={<SiArgo className="h-4 w-4" />}
        />
      </div>
    </div>
  );
};

export default ArgoCDView;