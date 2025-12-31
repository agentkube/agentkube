
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, Plus, AlertTriangle, CheckCircle, Info, Settings } from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';
import { kubeProxyRequest } from '@/api/cluster';
import { SearchResult } from '@/types/search';
import { ResourceInfoTooltip } from '../resource-tooltip.component';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface AlertSelectorProps {
  onResourceSelect: (resource: SearchResult) => void;
}

interface Alert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: string;
  activeAt: string;
  value: string;
}

interface AlertGroup {
  labels: Record<string, string>;
  receiver: Record<string, string>;
  alerts: Alert[];
}

const DEFAULT_ALERTMANAGER_CONFIG = {
  namespace: 'monitoring',
  service: 'kube-prometheus-stack-alertmanager:http-web'
};

const AlertSelector: React.FC<AlertSelectorProps> = ({ onResourceSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentContext } = useCluster();

  const [alertmanagerConfig, setAlertmanagerConfig] = useState(DEFAULT_ALERTMANAGER_CONFIG);
  const [isConfigMode, setIsConfigMode] = useState(false);
  const [tempConfig, setTempConfig] = useState(DEFAULT_ALERTMANAGER_CONFIG);

  // Load alertmanager config from local storage if available
  useEffect(() => {
    if (!currentContext) return;
    try {
      const savedConfig = localStorage.getItem(`${currentContext.name}.alertmanagerConfig`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setAlertmanagerConfig(parsedConfig);
        setTempConfig(parsedConfig);
      } else {
        // Default fallback if nothing saved
        setAlertmanagerConfig(DEFAULT_ALERTMANAGER_CONFIG);
        setTempConfig(DEFAULT_ALERTMANAGER_CONFIG);
      }
    } catch (err) {
      console.error('Error loading alertmanager config:', err);
    }
  }, [currentContext]);

  const handleSaveConfig = () => {
    if (!currentContext) return;
    try {
      localStorage.setItem(`${currentContext.name}.alertmanagerConfig`, JSON.stringify(tempConfig));
      setAlertmanagerConfig(tempConfig);
      setIsConfigMode(false);
      // Refresh alerts with new config
      setAlerts([]); // Clear current
      // Effect will trigger fetch if isOpen is true, but we depend on alertmanagerConfig in fetchAlerts
    } catch (err) {
      console.error('Error saving config:', err);
    }
  };

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const fetchAlerts = useCallback(async () => {
    if (!currentContext) return;
    setIsLoading(true);
    setError(null);

    try {
      // API Path: /api/v1/namespaces/{ns}/services/{svc}/proxy/api/v2/alerts
      // We can use /alerts/groups or just /alerts to get flat list
      const servicePath = `api/v1/namespaces/${alertmanagerConfig.namespace}/services/${alertmanagerConfig.service}/proxy/api/v2/alerts`;
      // params: active=true, silenced=false, inhibited=false
      const params = new URLSearchParams({
        active: 'true',
        silenced: 'false',
        inhibited: 'false',
        muted: 'false'
      });

      const response = await kubeProxyRequest(currentContext.name, `${servicePath}?${params}`, 'GET');

      if (response && Array.isArray(response)) {
        setAlerts(response);
      } else if (response && typeof response === 'object') {
        // Sometimes it returns object with data property depending on proxy behavior?
        // Standard Alertmanager API returns Array of alerts
        setAlerts(Array.isArray(response) ? response : []);
      } else {
        // Fallback or empty
        setAlerts([]);
      }

    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError('Failed to fetch alerts. Check configuration.');
    } finally {
      setIsLoading(false);
    }
  }, [currentContext, alertmanagerConfig]);

  useEffect(() => {
    if (isOpen && currentContext) {
      fetchAlerts();
    }
  }, [isOpen, currentContext, fetchAlerts]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  };

  const filteredAlerts = alerts.filter(alert => {
    // Filter by Severity
    if (selectedSeverity !== 'ALL') {
      if (alert.labels.severity?.toUpperCase() !== selectedSeverity) {
        return false;
      }
    }

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = alert.labels.alertname?.toLowerCase() || '';
    const desc = alert.annotations.description?.toLowerCase() || '';
    const summary = alert.annotations.summary?.toLowerCase() || '';
    return name.includes(q) || desc.includes(q) || summary.includes(q);
  });

  const handleAlertSelection = (alert: Alert) => {
    // Convert alert to a SearchResult/Resource
    // Since it's not a K8s resource, we create a pseudo-resource or use a special type.
    // The user wants to "add alerts into mentions", implying we treat it as context.

    const alertContent = JSON.stringify(alert, null, 2);

    const resource: SearchResult = {
      resourceType: 'alert',
      resourceName: alert.labels.alertname || 'unknown-alert',
      namespace: alertmanagerConfig.namespace,
      namespaced: true,
      group: 'monitoring.coreos.com',
      version: 'v1',
      // content: alertContent // We will handle fetching content if needed, but here we have it.
    };

    // We can enrich it immediately since we have the content
    const enrichedResource = {
      ...resource,
      resourceContent: alertContent
    };

    onResourceSelect(enrichedResource);
    setIsOpen(false);
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      case 'info': return 'text-blue-500';
      default: return 'text-gray-500';
    }
  };

  const getSeverityIcon = (severity?: string) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return <AlertTriangle size={12} className="text-red-500" />;
      case 'warning': return <AlertTriangle size={12} className="text-yellow-500" />;
      case 'info': return <Info size={12} className="text-blue-500" />;
      default: return <Bell size={12} className="text-gray-500" />;
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center text-muted-foreground hover:text-foreground transition-colors rounded px-2 py-1"
        title="Add Alert Context"
      >
        <AlertTriangle size={14} className="mr-1" />
        <span className="text-xs">Add Alerts</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1 w-96 rounded-md shadow-lg bg-white dark:bg-drawer/60 backdrop-blur-md border border-gray-400/30 dark:border-gray-800/50 z-50">
          <div className="p-2 space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-3 pr-3 py-2 bg-muted rounded text-xs text-foreground focus:outline-none focus:ring-ring"
                autoFocus
              />
            </div>

            {/* Severity Filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {['ALL', 'CRITICAL', 'WARNING', 'INFO'].map((sev) => (
                <button
                  key={sev}
                  onClick={() => setSelectedSeverity(sev)}
                  className={cn(
                    "px-2 text-[9px] uppercase font-bold rounded-md transition-colors border",
                    selectedSeverity === sev
                      ? "bg-foreground text-background border-foreground"
                      : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"
                  )}
                >
                  {sev}
                </button>
              ))}

              <div className="flex-1" /> {/* Spacer to push settings to right if needed, or just adjacent */}
              <button
                onClick={() => {
                  setIsConfigMode(!isConfigMode);
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted"
                title="Alertmanager Configuration"
              >
                <Settings size={14} />
              </button>
            </div>
          </div>

          {isConfigMode ? (
            <div className="p-3">
              <div className="text-xs font-semibold mb-3">Alertmanager Configuration</div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">Namespace</label>
                  <input
                    type="text"
                    value={tempConfig.namespace}
                    onChange={(e) => setTempConfig({ ...tempConfig, namespace: e.target.value })}
                    className="w-full px-2 py-1.5 bg-muted rounded text-xs border border-transparent focus:border-ring focus:outline-none"
                    placeholder="monitoring"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">Service Name</label>
                  <input
                    type="text"
                    value={tempConfig.service}
                    onChange={(e) => setTempConfig({ ...tempConfig, service: e.target.value })}
                    className="w-full px-2 py-1.5 bg-muted rounded text-xs border border-transparent focus:border-ring focus:outline-none"
                    placeholder="alertmanager:9093"
                  />
                  <div className="text-[9px] text-muted-foreground mt-1">
                    Format: service-name:port-name (or port number)
                  </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={() => {
                      setIsConfigMode(false);
                      setTempConfig(alertmanagerConfig); // Reset changes
                    }}
                    className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveConfig}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="px-3 pb-1">
                <div className="text-xs text-gray-500 uppercase font-medium">
                  Active Alerts {filteredAlerts.length > 0 && `(${filteredAlerts.length})`}
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto py-1
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

                {isLoading && (
                  <div className="px-3 py-2 text-sm text-gray-500 flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Loading alerts...
                  </div>
                )}

                {error && (
                  <div className="px-3 py-2 text-sm text-red-500">
                    {error}
                  </div>
                )}

                {!isLoading && !error && filteredAlerts.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    No alerts found matching "{searchQuery}"
                  </div>
                )}

                {!isLoading && !error && filteredAlerts.map((alert, index) => (
                  <TooltipProvider key={`alert-${index}`}>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <div
                          className="px-3 py-2 border-b border-gray-100 dark:border-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-accent/10 transition-colors"
                          onClick={() => handleAlertSelection(alert)}
                        >
                          <div className="flex items-start gap-2">
                            <div className="mt-0.5">
                              {getSeverityIcon(alert.labels.severity)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground truncate">
                                  {alert.labels.alertname}
                                </span>
                                <span className={`text-[10px] uppercase ${getSeverityColor(alert.labels.severity)}`}>
                                  {alert.labels.severity || 'unknown'}
                                </span>
                              </div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                                {/* Show resource context if available */}
                                {alert.labels.pod ? (
                                  <span className="font-mono bg-muted/50 px-1 rounded mr-1">
                                    {alert.labels.pod}
                                  </span>
                                ) : alert.labels.instance ? (
                                  <span className="font-mono bg-muted/50 px-1 rounded mr-1">
                                    {alert.labels.instance}
                                  </span>
                                ) : null}
                                <span className="text-gray-500">
                                  {alert.annotations.summary || alert.annotations.description}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="w-80 p-0 border border-border bg-card text-card">
                        <div className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            {getSeverityIcon(alert.labels.severity)}
                            <span className="font-semibold text-sm">{alert.labels.alertname}</span>
                          </div>

                          <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
                            {alert.annotations.description || alert.annotations.summary}
                          </div>

                          <div className="space-y-2">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">Affected Resource</div>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(alert.labels)
                                .filter(([key]) => ['pod', 'namespace', 'service', 'instance', 'job', 'container', 'node'].includes(key))
                                .map(([key, value]) => (
                                  <div key={key} className="bg-muted/50 p-1.5 rounded">
                                    <div className="text-[9px] text-muted-foreground uppercase">{key}</div>
                                    <div className="text-xs font-mono truncate" title={value}>{value}</div>
                                  </div>
                                ))
                              }
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
                            <span>State: {alert.state}</span>
                            <span>{new Date(alert.activeAt).toLocaleString()}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertSelector;