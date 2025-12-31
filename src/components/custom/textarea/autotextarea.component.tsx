import React, { useRef, useState, useEffect, ChangeEvent, FocusEvent, KeyboardEvent, useImperativeHandle, useCallback } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { useTerminal, TerminalSession } from '@/contexts/useTerminal';
import { useCodeBlock, CodeBlockSession } from '@/contexts/useCodeBlock';
import { queryResource, listResources } from '@/api/internal/resources';
import { SearchResult, EnrichedSearchResult } from '@/types/search';
import { jsonToYaml } from '@/utils/yaml';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { ResourceInfoTooltip } from '../resource-tooltip.component';
import { AlertCircle, Terminal, Globe, Bell, AlertTriangle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { kubeProxyRequest } from '@/api/cluster';

const isPodFailing = (pod: any): boolean => {
  const phase = pod.status?.phase?.toLowerCase();
  return phase === 'failed' || phase === 'error' ||
    (pod.status?.containerStatuses || []).some((status: any) =>
      status.state?.waiting?.reason === 'CrashLoopBackOff' ||
      status.state?.waiting?.reason === 'ImagePullBackOff' ||
      status.state?.waiting?.reason === 'ErrImagePull'
    );
};

const getTimeSince = (timestamp: any) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
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

// Kubernetes resource types that can be searched
const KUBERNETES_RESOURCE_TYPES = [
  { id: 'pods', label: 'Pods', description: 'Search across all pods' },
  { id: 'deployments', label: 'Deployments', description: 'Search across all deployments' },
  { id: 'services', label: 'Services', description: 'Search across all services' },
  { id: 'configmaps', label: 'ConfigMaps', description: 'Search across all configmaps' },
  { id: 'secrets', label: 'Secrets', description: 'Search across all secrets' },
  { id: 'namespaces', label: 'Namespaces', description: 'Search across all namespaces' },
  { id: 'nodes', label: 'Nodes', description: 'Search across all nodes' },
  { id: 'ingresses', label: 'Ingresses', description: 'Search across all ingresses' },
  { id: 'persistentvolumeclaims', label: 'PVCs', description: 'Search across all PVCs' },
  { id: 'statefulsets', label: 'StatefulSets', description: 'Search across all statefulsets' },
  { id: 'daemonsets', label: 'DaemonSets', description: 'Search across all daemonsets' },
  { id: 'jobs', label: 'Jobs', description: 'Search across all jobs' },
  { id: 'cronjobs', label: 'CronJobs', description: 'Search across all cronjobs' },
  { id: 'events', label: 'Events', description: 'Search across all events' },
  { id: 'replicasets', label: 'ReplicaSets', description: 'Search across all replicasets' },
];

interface MentionItem {
  id: string | number;
  name: string;
  description?: string;
}

// Resource mention item for Kubernetes resources
interface ResourceMentionItem {
  id: string;
  name: string;
  description?: string;
  resourceType: string;
  namespace?: string;
  isResourceType?: boolean; // Is this a resource type category (like @pods/)
  searchResult?: SearchResult; // Full search result for actual resources
  // Optional event details for direct display
  eventReason?: string;
  eventMessage?: string;
  eventInvolvedObject?: string;
  eventLastSeen?: any;
  eventType?: string;
  terminalSessionId?: string;
  terminalLastCommand?: string;
  codeBlockId?: string;
  codeBlockLanguage?: string;
  codeBlockContent?: string;
  alertSeverity?: string;
  alertData?: any; // Store full alert object to avoid parsing JSON repeatedly
}

interface AutoResizeTextareaProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onSubmit?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  mentionItems?: MentionItem[];
  onMentionSelect?: (item: MentionItem) => void;
  onResourceSelect?: (resource: EnrichedSearchResult) => void;
  onResourceRemove?: (resourceRef: string) => void; // Called when a resource mention is removed from text
  width?: string | number;
  animatedSuggestions?: string[];
  dropdownPosition?: 'top' | 'bottom'; // Position of the mention dropdown
  [key: string]: any;
}


type DropdownMode = 'functions' | 'resourceTypes' | 'resources' | 'terminal' | 'codeblock' | 'alerts';

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(({
  value,
  onChange,
  onFocus,
  onBlur,
  onSubmit,
  placeholder = "",
  disabled,
  className,
  mentionItems = [],
  onMentionSelect,
  onResourceSelect,
  onResourceRemove,
  width = "100%", // Default to 100%
  animatedSuggestions = [],
  dropdownPosition = 'top', // Default to top (above textarea)
  ...props
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => textareaRef.current!);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Convert placeholder to string to prevent [object Object] display
  const placeholderStr = typeof placeholder === 'string' ? placeholder : String(placeholder || "");

  // State for mention dropdown
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentSuggestion, setCurrentSuggestion] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Resource mention state
  const [dropdownMode, setDropdownMode] = useState<DropdownMode>('functions');
  const [selectedResourceType, setSelectedResourceType] = useState<string | null>(null);
  const [resourceSearchResults, setResourceSearchResults] = useState<ResourceMentionItem[]>([]);
  const [alertSearchResults, setAlertSearchResults] = useState<ResourceMentionItem[]>([]);
  const [failingPodKeys, setFailingPodKeys] = useState<Set<string>>(new Set());
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [insertedResources, setInsertedResources] = useState<Set<string>>(new Set()); // Track inserted resource refs
  const lastSearchIdRef = useRef<number>(0);

  const { currentContext } = useCluster();
  const { sessions, getTerminalContent } = useTerminal();
  const { codeBlocks } = useCodeBlock();

  const useAnimatedSuggestions = animatedSuggestions.length > 0;

  // Auto-resize function
  const autoResize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 200;
    if (textarea.scrollHeight > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.style.overflowY = 'hidden';
    }
  };

  // Resize on value change
  useEffect(() => {
    autoResize();
  }, [value]);

  // Detect when resource mentions are removed from text
  useEffect(() => {
    if (onResourceRemove && insertedResources.size > 0) {
      const removedResources: string[] = [];

      insertedResources.forEach(resourceRef => {
        // Check if this resource reference still exists in the text
        if (!value.includes(resourceRef)) {
          removedResources.push(resourceRef);
        }
      });

      // Remove from tracking and notify parent
      if (removedResources.length > 0) {
        setInsertedResources(prev => {
          const newSet = new Set(prev);
          removedResources.forEach(ref => newSet.delete(ref));
          return newSet;
        });

        // Notify parent about each removed resource
        removedResources.forEach(ref => onResourceRemove(ref));
      }
    }
  }, [value, insertedResources, onResourceRemove]);

  // suggestions effect
  useEffect(() => {
    if (useAnimatedSuggestions && !value) {
      const interval = setInterval(() => {
        setIsAnimating(true);

        setTimeout(() => {
          setCurrentSuggestion((prev) => (prev + 1) % animatedSuggestions.length);
          setIsAnimating(false);
        }, 300);
      }, 2500);

      return () => clearInterval(interval);
    }
  }, [animatedSuggestions.length, value, useAnimatedSuggestions]);

  // Parse the mention pattern - supports both @functionName and @resourceType/resourceName
  const parseMentionPattern = useCallback((textBeforeCursor: string) => {
    // Match patterns like:
    // @terminal:session-name - terminal session mention
    // @pods/nginx - resource type with search term
    // @pods - resource type or initial mention
    // @functionName - function mention

    const terminalMatch = textBeforeCursor.match(/@terminal:([a-zA-Z0-9_-]*)$/);
    if (terminalMatch) {
      return {
        type: 'terminal' as const,
        searchQuery: terminalMatch[1].toLowerCase(),
        fullMatch: terminalMatch[0]
      };
    }

    const codeblockMatch = textBeforeCursor.match(/@:([a-zA-Z0-9_-]*)$/);
    if (codeblockMatch) {
      return {
        type: 'codeblock' as const,
        searchQuery: codeblockMatch[1].toLowerCase(),
        fullMatch: codeblockMatch[0]
      };
    }

    const alertsMatch = textBeforeCursor.match(/@alerts:([a-zA-Z0-9_-]*)$/);
    if (alertsMatch) {
      return {
        type: 'alerts' as const,
        searchQuery: alertsMatch[1].toLowerCase(),
        fullMatch: alertsMatch[0]
      };
    }

    // More permissive match for the search query part (everything until space or another @)
    const resourceWithSearchMatch = textBeforeCursor.match(/@([a-zA-Z0-9_-]+)\/([^@\s]*)$/);
    if (resourceWithSearchMatch) {
      const resourceType = resourceWithSearchMatch[1].toLowerCase();
      const searchQuery = resourceWithSearchMatch[2].toLowerCase();
      const isValidResourceType = KUBERNETES_RESOURCE_TYPES.some(rt => rt.id === resourceType);
      if (isValidResourceType) {
        return {
          type: 'resources' as const,
          resourceType,
          searchQuery,
          fullMatch: resourceWithSearchMatch[0]
        };
      }
    }

    const simpleMatch = textBeforeCursor.match(/@([a-zA-Z0-9_-]*)$/);
    if (simpleMatch) {
      const term = simpleMatch[1].toLowerCase();
      return {
        type: 'initial' as const,
        term,
        fullMatch: simpleMatch[0]
      };
    }

    return null;
  }, []);

  // Search for Alerts
  const searchAlerts = useCallback(async (query: string) => {
    if (!currentContext) return;

    // Default config as requested
    const namespace = 'monitoring';
    const service = 'kube-prometheus-stack-alertmanager:http-web';

    try {
      const servicePath = `api/v1/namespaces/${namespace}/services/${service}/proxy/api/v2/alerts`;
      const params = new URLSearchParams({
        active: 'true',
        silenced: 'false',
        inhibited: 'false',
        muted: 'false'
      });

      const response = await kubeProxyRequest(currentContext.name, `${servicePath}?${params}`, 'GET');

      let alerts: any[] = [];
      if (response && Array.isArray(response)) {
        alerts = response;
      } else if (response && Array.isArray(response.data)) {
        alerts = response.data;
      }

      const results: ResourceMentionItem[] = alerts
        .filter((alert: any) => {
          if (!query) return true;
          const q = query.toLowerCase();
          const name = alert.labels?.alertname?.toLowerCase() || '';
          return name.includes(q);
        })
        .map((alert: any) => ({
          id: `alert/${alert.labels?.alertname || 'unknown'}`,
          name: alert.labels?.alertname || 'Unknown Alert',
          description: alert.annotations?.summary || alert.annotations?.description || 'No description',
          resourceType: 'alert',
          namespace: namespace, // source namespace
          alertSeverity: alert.labels?.severity,
          alertData: alert,
          searchResult: {
            resourceType: 'alert',
            resourceName: alert.labels?.alertname || 'unknown',
            namespace: namespace,
            namespaced: true,
            group: 'monitoring.coreos.com',
            version: 'v1',
            resourceContent: JSON.stringify(alert, null, 2)
          },
        }));

      setAlertSearchResults(results);
    } catch (err) {
      console.error('Error searching alerts:', err);
      // Fallback or empty
      setAlertSearchResults([]);
    }
  }, [currentContext]);

  // Debounce effect for alert search
  useEffect(() => {
    if (dropdownMode === 'alerts') {
      const timeout = setTimeout(() => {
        searchAlerts(searchTerm);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [dropdownMode, searchTerm, searchAlerts]);


  // Search for Kubernetes resources
  const searchResources = useCallback(async (resourceType: string, query: string) => {
    if (!currentContext) return;

    const searchId = ++lastSearchIdRef.current;
    setIsLoadingResources(true);

    try {
      let results: ResourceMentionItem[] = [];

      if (resourceType === 'events' || resourceType === 'nodes' || resourceType === 'namespaces') {
        // For cluster-wide or high-detail resources, use listResources directly
        const items = await listResources(currentContext.name, resourceType as any, {
          // No special options needed for nodes/namespaces/events
        });

        // Abort if a newer search has been started
        if (searchId !== lastSearchIdRef.current) return;

        results = items
          .filter(item => {
            if (!query) return true;
            const q = query.toLowerCase();
            const name = item.metadata?.name || '';
            const labels = Object.values(item.metadata?.labels || {}).join(' ');

            if (resourceType === 'events') {
              const event = item as any;
              return (
                (event.involvedObject?.name || '').toLowerCase().includes(q) ||
                (event.message || '').toLowerCase().includes(q) ||
                (event.reason || '').toLowerCase().includes(q)
              );
            }

            return name.toLowerCase().includes(q) || labels.toLowerCase().includes(q);
          })
          .slice(0, 30) // Limit results
          .map(item => {
            if (resourceType === 'events') {
              const event = item as any;
              return {
                id: `events/${event.metadata?.namespace || 'cluster'}/${event.metadata?.name}`,
                name: event.metadata?.name || '',
                description: event.metadata?.namespace ? `${event.metadata.namespace}` : 'cluster-scoped',
                resourceType: 'events',
                namespace: event.metadata?.namespace,
                searchResult: {
                  resourceType: 'events',
                  resourceName: event.metadata?.name || '',
                  namespace: event.metadata?.namespace || '',
                  namespaced: !!event.metadata?.namespace,
                  group: '',
                  version: 'v1'
                },
                eventReason: event.reason,
                eventMessage: event.message,
                eventInvolvedObject: `${event.involvedObject?.kind}/${event.involvedObject?.name}`,
                eventLastSeen: event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp,
                eventType: event.type
              };
            }

            return {
              id: `${resourceType}/${item.metadata?.namespace || 'cluster'}/${item.metadata?.name}`,
              name: item.metadata?.name || '',
              description: item.metadata?.namespace ? `${item.metadata.namespace}` : 'cluster-scoped',
              resourceType: resourceType,
              namespace: item.metadata?.namespace,
              searchResult: {
                resourceType: resourceType,
                resourceName: item.metadata?.name || '',
                namespace: item.metadata?.namespace || '',
                namespaced: !!item.metadata?.namespace,
                group: '',
                version: 'v1'
              }
            };
          });
      } else {
        const response = await queryResource(
          currentContext.name,
          query || resourceType,
          30,
          resourceType
        );

        // Abort if a newer search has been started
        if (searchId !== lastSearchIdRef.current) return;

        results = (response?.results || []).map((result: SearchResult) => ({
          id: `${result.resourceType}/${result.namespace || 'cluster'}/${result.resourceName}`,
          name: result.resourceName,
          description: result.namespace ? `${result.namespace}` : 'cluster-scoped',
          resourceType: result.resourceType,
          namespace: result.namespace,
          searchResult: result
        }));
      }

      setResourceSearchResults(results);
    } catch (error) {
      console.error('Error searching resources:', error);
      // Only clear if this is still the active search
      if (searchId === lastSearchIdRef.current) {
        setResourceSearchResults([]);
      }
    } finally {
      // Only stop loading if this is the active search
      if (searchId === lastSearchIdRef.current) {
        setIsLoadingResources(false);
      }
    }
  }, [currentContext]);

  // Check for failing pods when resource search results change
  useEffect(() => {
    if (resourceSearchResults.length === 0 || !currentContext) {
      setFailingPodKeys(new Set());
      return;
    }

    const checkHealth = async () => {
      const pods = resourceSearchResults.filter(r => r.resourceType === 'pods');
      if (pods.length === 0) return;

      const namespaces = Array.from(new Set(pods.map(p => p.namespace).filter(Boolean) as string[]));
      const failing = new Set<string>();

      try {
        const podData = await Promise.all(
          namespaces.map(ns => listResources(currentContext.name, 'pods', { namespace: ns }))
        );

        const allPods = podData.flat();
        allPods.forEach(pod => {
          if (pod.metadata?.namespace && pod.metadata?.name && isPodFailing(pod)) {
            failing.add(`pods/${pod.metadata.namespace}/${pod.metadata.name}`);
          }
        });

        setFailingPodKeys(failing);
      } catch (err) {
        console.error('Error checking health:', err);
      }
    };

    checkHealth();
  }, [resourceSearchResults, currentContext]);

  // Handle input change and detect mentions
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const position = e.target.selectionStart || 0;

    setCursorPosition(position);

    const textBeforeCursor = newValue.substring(0, position);
    const mentionPattern = parseMentionPattern(textBeforeCursor);

    if (mentionPattern) {
      setShowMentionDropdown(true);
      setSelectedIndex(0);

      if (mentionPattern.type === 'terminal') {
        setDropdownMode('terminal');
        setSearchTerm(mentionPattern.searchQuery);
      } else if (mentionPattern.type === 'codeblock') {
        setDropdownMode('codeblock');
        setSearchTerm(mentionPattern.searchQuery);
      } else if (mentionPattern.type === 'alerts') {
        setDropdownMode('alerts');
        setSearchTerm(mentionPattern.searchQuery);
      } else if (mentionPattern.type === 'resources') {
        // User typed @resourceType/
        setDropdownMode('resources');
        setSelectedResourceType(mentionPattern.resourceType);
        setSearchTerm(mentionPattern.searchQuery);

        // Debounce search
        if (searchTimeout) clearTimeout(searchTimeout);
        const timeout = setTimeout(() => {
          searchResources(mentionPattern.resourceType, mentionPattern.searchQuery);
        }, 300);
        setSearchTimeout(timeout);
      } else if (mentionPattern.type === 'initial') {
        // User typed @something - check if it matches a resource type
        const matchingTypes = KUBERNETES_RESOURCE_TYPES.filter(rt =>
          rt.id.startsWith(mentionPattern.term) || rt.label.toLowerCase().startsWith(mentionPattern.term)
        );

        const isTerminalMatch = 'terminal:'.startsWith(mentionPattern.term);
        const isCodeBlockMatch = ':'.startsWith(mentionPattern.term); // Matches @:
        const isAlertsMatch = 'alerts:'.startsWith(mentionPattern.term);

        const matchingFunctions = mentionItems.filter((item: MentionItem) =>
          item.name.toLowerCase().includes(mentionPattern.term)
        );

        // If term exactly matches a resource type or terminal, or no matching functions, show resource types
        if (matchingTypes.length > 0 || isTerminalMatch || isCodeBlockMatch || isAlertsMatch || matchingFunctions.length === 0) {
          setDropdownMode('resourceTypes');
          setSearchTerm(mentionPattern.term);
          setSelectedResourceType(null);
        } else {
          setDropdownMode('functions');
          setSearchTerm(mentionPattern.term);
        }
      }
    } else {
      setShowMentionDropdown(false);
      setDropdownMode('functions');
      setSelectedResourceType(null);
    }

    onChange(e);
  };

  // Get filtered items based on dropdown mode
  const getFilteredItems = (): (MentionItem | ResourceMentionItem)[] => {
    if (dropdownMode === 'functions') {
      if (!searchTerm) return mentionItems;
      return mentionItems.filter((item: MentionItem) =>
        item.name.toLowerCase().includes(searchTerm)
      );
    }

    if (dropdownMode === 'resourceTypes') {
      const filtered = KUBERNETES_RESOURCE_TYPES.filter(rt =>
        !searchTerm || rt.id.startsWith(searchTerm) || rt.label.toLowerCase().startsWith(searchTerm)
      );

      const items: ResourceMentionItem[] = filtered.map(rt => ({
        id: rt.id,
        name: `${rt.id}/`,
        description: rt.description,
        resourceType: rt.id,
        isResourceType: true
      }));

      // Add terminal option if it matches
      if (!searchTerm || 'terminal:'.startsWith(searchTerm)) {
        items.push({
          id: 'terminal-type',
          name: 'terminal:',
          description: 'Mention a terminal session',
          resourceType: 'terminal',
          isResourceType: true
        });
      }

      // Add codeblock option if it matches
      if (!searchTerm || ':'.startsWith(searchTerm)) { // Matches @:
        items.push({
          id: 'codeblock-type',
          name: 'codeblock:',
          description: 'Mention a code block',
          resourceType: 'codeblock',
          isResourceType: true
        });
      }

      // Add alerts option if it matches
      if (!searchTerm || 'alerts:'.startsWith(searchTerm)) {
        items.push({
          id: 'alerts-type',
          name: 'alerts:',
          description: 'Mention active alerts',
          resourceType: 'alerts',
          isResourceType: true
        });
      }

      return items;
    }

    if (dropdownMode === 'codeblock') {
      return codeBlocks
        .map(cb => ({
          id: `codeblock-${cb.id}`,
          name: cb.id,
          resourceType: 'codeblock',
          codeBlockId: cb.id,
          codeBlockLanguage: cb.language,
          codeBlockContent: cb.content,
          description: `${cb.language} snippet`
        }))
        .filter(item => !searchTerm || item.name.toLowerCase().includes(searchTerm));
    }

    if (dropdownMode === 'alerts') {
      return alertSearchResults;
    }

    if (dropdownMode === 'terminal') {
      return sessions
        .filter(s => s.type === 'terminal')
        .map(s => {
          const terminalData = s.data as TerminalSession;
          return {
            id: `terminal-${terminalData.id}`,
            name: terminalData.name,
            resourceType: 'terminal',
            terminalSessionId: terminalData.id,
            terminalLastCommand: terminalData.last_command,
            description: terminalData.last_command ? `Last: ${terminalData.last_command}` : 'Active session'
          };
        })
        .filter(item => !searchTerm || item.name.toLowerCase().includes(searchTerm) || item.terminalLastCommand?.toLowerCase().includes(searchTerm));
    }

    if (dropdownMode === 'resources') {
      return resourceSearchResults;
    }

    return [];
  };

  // Handle keydown events for dropdown navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionDropdown) {
      const filteredItems = getFilteredItems();

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : prev));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
          break;

        case 'Enter':
        case 'Tab':
          if (filteredItems.length > 0) {
            e.preventDefault();
            const selectedItem = filteredItems[selectedIndex];

            if ('isResourceType' in selectedItem && selectedItem.isResourceType) {
              // User selected a resource type - insert it and trigger resource search
              insertResourceType(selectedItem as ResourceMentionItem);
            } else if ('searchResult' in selectedItem && selectedItem.searchResult) {
              // User selected an actual resource
              insertResource(selectedItem as ResourceMentionItem);
            } else {
              // Regular function mention
              insertMention(selectedItem as MentionItem);
            }
          }
          break;

        case 'Escape':
          e.preventDefault();
          setShowMentionDropdown(false);
          setDropdownMode('functions');
          setSelectedResourceType(null);
          break;

        case 'Backspace':
          // If we're at @resourceType/ and backspace, go back to resource types
          if (dropdownMode === 'resources' && searchTerm === '') {
            setDropdownMode('resourceTypes');
            setSelectedResourceType(null);
          }
          break;

        default:
          break;
      }
    }

    // Handle Enter for submission (original behavior)
    if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
      e.preventDefault();
      if (value.trim() && onSubmit) {
        onSubmit(e);
      }
    }
  };

  // Insert resource type (e.g., @pods/) and wait for resource selection
  const insertResourceType = (item: ResourceMentionItem) => {
    // Get the ACTUAL current cursor position from the textarea (not stale state)
    const actualCursorPos = textareaRef.current?.selectionStart || cursorPosition;
    const currentValue = textareaRef.current?.value || value;

    const textBeforeCursor = currentValue.substring(0, actualCursorPos);
    const textAfterCursor = currentValue.substring(actualCursorPos);

    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const isTerminal = item.resourceType === 'terminal';
      const isCodeBlock = item.resourceType === 'codeblock';
      const isAlerts = item.resourceType === 'alerts';
      let insertPart = `@${item.resourceType}/`;
      if (isTerminal) insertPart = `@terminal:`;
      if (isCodeBlock) insertPart = `@:`;
      if (isAlerts) insertPart = `@alerts:`;

      const newText =
        currentValue.substring(0, lastAtPos) +
        insertPart +
        textAfterCursor;

      const syntheticEvent = {
        target: { value: newText }
      } as ChangeEvent<HTMLTextAreaElement>;

      onChange(syntheticEvent);

      // Switch to search mode
      if (isTerminal) {
        setDropdownMode('terminal');
      } else if (isCodeBlock) {
        setDropdownMode('codeblock');
      } else if (isAlerts) {
        setDropdownMode('alerts');
        // Trigger initial alert search
        searchAlerts('');
      } else {
        setDropdownMode('resources');
        setSelectedResourceType(item.resourceType);
        // Trigger initial resource fetch
        searchResources(item.resourceType, '');
      }
      setSearchTerm('');
      setSelectedIndex(0);

      // Set focus back to textarea
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = lastAtPos + insertPart.length;
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };


  // Fetch the resource content (YAML) for a given resource
  const fetchResourceContent = useCallback(async (resource: SearchResult): Promise<string> => {
    try {
      if (!currentContext) return '';

      // Get the resource details using the existing listResources function
      const result = await listResources(
        currentContext.name,
        resource.resourceType as any,
        {
          namespace: resource.namespaced ? resource.namespace : undefined,
          name: resource.resourceName,
          apiGroup: resource.group || undefined,
          apiVersion: resource.version || 'v1'
        }
      );

      // Convert the resource to YAML format using the existing utility
      if (result.length > 0) {
        // Ensure the resource has kind and apiVersion for complete YAML
        const completeResource = {
          kind: resource.resourceType,
          apiVersion: resource.group ? `${resource.group}/${resource.version}` : resource.version,
          ...result[0]
        };
        return jsonToYaml(completeResource);
      }

      return '';
    } catch (err) {
      console.error('Failed to fetch resource content:', err);
      return '';
    }
  }, [currentContext]);

  // Insert actual resource (e.g., @pods/nginx-deployment)
  const insertResource = async (item: ResourceMentionItem) => {
    // Get the ACTUAL current cursor position from the textarea (not stale state)
    const actualCursorPos = textareaRef.current?.selectionStart || cursorPosition;
    const currentValue = textareaRef.current?.value || value;

    const textBeforeCursor = currentValue.substring(0, actualCursorPos);
    const textAfterCursor = currentValue.substring(actualCursorPos);

    // Find the @ position that started this mention
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const isTerminal = item.resourceType === 'terminal';
      const isCodeBlock = item.resourceType === 'codeblock';
      const isAlert = item.resourceType === 'alert';
      // The resource reference we want to insert
      let resourceRef = `@${item.resourceType}/${item.name}`;

      if (isTerminal) {
        resourceRef = `@terminal:${item.name}-${item.terminalSessionId?.slice(0, 6)}`;
      } else if (isCodeBlock) {
        resourceRef = `@:${item.name}`;
      } else if (isAlert) {
        resourceRef = `@alert:${item.name}`;
      }

      // Build new text: everything before @, then the full reference, then everything after cursor
      const newText =
        currentValue.substring(0, lastAtPos) +
        resourceRef +
        ' ' +
        textAfterCursor;

      const syntheticEvent = {
        target: { value: newText }
      } as ChangeEvent<HTMLTextAreaElement>;

      onChange(syntheticEvent);
      setShowMentionDropdown(false);
      setDropdownMode('functions');
      setSelectedResourceType(null);

      // Set focus back to textarea and place cursor after the inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = lastAtPos + resourceRef.length + 1; // +1 for space
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);

      // Trigger callback with enriched resource (including content)
      if (onResourceSelect) {
        if (isTerminal && item.terminalSessionId) {
          // Track for removal detection
          setInsertedResources(prev => new Set(prev).add(resourceRef));

          const terminalContent = getTerminalContent(item.terminalSessionId);

          const terminalResource: EnrichedSearchResult = {
            resourceType: 'terminal',
            resourceName: item.name,
            namespace: '',
            namespaced: false,
            group: 'terminal',
            version: 'v1',
            resourceContent: terminalContent
          };

          onResourceSelect(terminalResource);
        } else if (isCodeBlock && item.codeBlockId) {
          // Track for removal detection
          setInsertedResources(prev => new Set(prev).add(resourceRef));

          const codeBlockResource: EnrichedSearchResult = {
            resourceType: 'codeblock',
            resourceName: item.name,
            namespace: '',
            namespaced: false,
            group: 'codeblock',
            version: 'v1',
            resourceContent: item.codeBlockContent || item.codeBlockId // fallback to ID if content missing
          };

          onResourceSelect(codeBlockResource);
        } else if (isAlert && item.searchResult) {
          setInsertedResources(prev => new Set(prev).add(resourceRef));

          // Item should already have the content in searchResult
          const searchRes = item.searchResult as any;
          onResourceSelect({
            ...searchRes,
            // Ensure content is there
            resourceContent: searchRes.resourceContent
          } as any);
        } else if (item.searchResult) {
          // Track this resource reference for removal detection
          setInsertedResources(prev => new Set(prev).add(resourceRef));

          // Fetch the resource content (YAML)
          const resourceContent = await fetchResourceContent(item.searchResult);

          const enrichedResource: EnrichedSearchResult = {
            ...item.searchResult,
            resourceContent
          };

          onResourceSelect(enrichedResource);
        }
      }
    }
  };

  // Insert mention at cursor position (for functions)
  const insertMention = (item: MentionItem) => {
    // Get the ACTUAL current cursor position from the textarea (not stale state)
    const actualCursorPos = textareaRef.current?.selectionStart || cursorPosition;
    const currentValue = textareaRef.current?.value || value;

    const textBeforeCursor = currentValue.substring(0, actualCursorPos);
    const textAfterCursor = currentValue.substring(actualCursorPos);

    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const newText =
        currentValue.substring(0, lastAtPos) +
        `@${item.name} ` +
        textAfterCursor;

      const syntheticEvent = {
        target: { value: newText }
      } as ChangeEvent<HTMLTextAreaElement>;

      onChange(syntheticEvent);
      setShowMentionDropdown(false);

      // Set focus back to textarea and place cursor after the inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = lastAtPos + item.name.length + 2; // +2 for @ and space
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);

      // Trigger the onMentionSelect callback if provided
      if (onMentionSelect) {
        onMentionSelect(item);
      }
    }
  };



  // Get dropdown header based on mode
  const getDropdownHeader = () => {
    switch (dropdownMode) {
      case 'resources':
        return `Resources (${selectedResourceType})`;
      case 'resourceTypes':
        return 'Context & Resources';
      case 'terminal':
        return 'Terminal Sessions';
      default:
        return 'Functions';
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowMentionDropdown(false);
        setDropdownMode('functions');
        setSelectedResourceType(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Focus the textarea initially if needed
  useEffect(() => {
    if (props.autoFocus) {
      textareaRef.current?.focus();
    }
  }, [props.autoFocus]);

  const filteredItems = getFilteredItems();

  return (
    <div
      ref={containerRef}
      style={{
        width: width,
        position: 'relative',
        boxSizing: 'border-box'
      }}
    >
      {/* Mention dropdown - positioned based on dropdownPosition prop */}
      {showMentionDropdown && (
        <div
          ref={dropdownRef}
          style={{
            position: 'absolute',
            ...(dropdownPosition === 'top'
              ? { bottom: '100%', marginBottom: '5px' }
              : { top: '30px', marginTop: '5px' }
            ),
            left: 0,
            width: (dropdownMode === 'resources' || dropdownMode === 'terminal') ? '60%' : '50%',
            maxHeight: '250px',
            overflow: 'auto',
            zIndex: 100,
            borderRadius: '0.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          }}
          className="text-xs bg-card dark:bg-card backdrop-blur-md border border-accent dark:border-accent
            overflow-y-auto py-1 
            
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-accent/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-accent/50
          "
        >
          <div
            style={{
              padding: '0.5rem',
            }}
            className="font-bold bg-card dark:bg-card dark:border-accent dark:text-foreground text-foreground sticky z-10 -top-1 bg-white dark:bg-card border-b border-accent/50 dark:border-accent/50"
          >
            {getDropdownHeader()}
            {dropdownMode === 'resourceTypes' && (
              <span className="font-normal ml-2 text-gray-400">Type @pods/ to search pods</span>
            )}
          </div>

          {isLoadingResources ? (
            <div className="px-3 py-4 text-gray-500 flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Searching...
            </div>
          ) : filteredItems.length > 0 ? (() => {
            const failingItems = resourceSearchResults.filter(item =>
              item.resourceType === 'pods' && failingPodKeys.has(`pods/${item.namespace}/${item.name}`)
            );
            const otherItems = filteredItems.filter(item => {
              if ('resourceType' in item && item.resourceType === 'pods' && failingPodKeys.has(`pods/${item.namespace}/${item.name}`)) {
                return false;
              }
              return true;
            });

            const renderItem = (item: MentionItem | ResourceMentionItem, idx: number, actualIndex: number) => {
              const isResourceItem = 'resourceType' in item;
              const isResourceType = isResourceItem && (item as ResourceMentionItem).isResourceType;
              const isFailing = isResourceItem && item.resourceType === 'pods' && failingPodKeys.has(`pods/${item.namespace}/${item.name}`);
              const isEvent = isResourceItem && item.resourceType === 'events';
              const eventItem = item as ResourceMentionItem;

              const isTerminal = isResourceItem && item.resourceType === 'terminal';

              const isAlert = isResourceItem && item.resourceType === 'alert';
              const alertItem = item as ResourceMentionItem;

              const element = (
                <div
                  key={item.id}
                  style={{ padding: '0.4rem 0.75rem', cursor: 'pointer' }}
                  className={`flex items-center gap-2 ${selectedIndex === actualIndex ? 'dark:bg-foreground/10 bg-foreground/50' : 'hover:bg-foreground dark:hover:bg-foreground/10'} ${isFailing ? 'text-red-500/90 dark:text-red-400/90' : ''}`}
                  onClick={() => {
                    if (isResourceType) {
                      insertResourceType(item as ResourceMentionItem);
                    } else if (isTerminal || (isResourceItem && (item as ResourceMentionItem).searchResult)) {
                      insertResource(item as ResourceMentionItem);
                    } else {
                      insertMention(item as MentionItem);
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(actualIndex)}
                >
                  {isResourceItem && (
                    isTerminal ? (
                      <Terminal size={14} className="flex-shrink-0 opacity-70" />
                    ) : isAlert ? (
                      <div className="flex-shrink-0">
                        {getSeverityIcon(alertItem.alertSeverity)}
                      </div>
                    ) : (
                      <img src={KUBERNETES_LOGO} alt="K8s" className={`w-4 h-4 flex-shrink-0 ${isFailing ? 'opacity-100' : 'opacity-70'}`} />
                    )
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Alert severity label */}
                      {isAlert && (
                        <span className={cn("text-[10px] font-bold uppercase", getSeverityColor(alertItem.alertSeverity))}>
                          {alertItem.alertSeverity || 'UNK'}
                        </span>
                      )}

                      {isEvent && eventItem.eventReason && (
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded shrink-0 uppercase ${eventItem.eventType === 'Warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'}`}>
                          {eventItem.eventReason}
                        </span>
                      )}

                      <div style={{ fontWeight: 500 }} className="truncate">{item.name}</div>
                    </div>
                    {(item.description || (isEvent && eventItem.eventMessage)) && (
                      <div className="text-[10px] opacity-60 flex justify-between gap-2 min-w-0 mt-0.5">
                        <div className="flex items-center min-w-0 truncate">
                          {/* Alert resource context pill */}
                          {isAlert && alertItem.alertData?.labels?.pod ? (
                            <span className="font-mono bg-muted/50 px-1 rounded mr-1 shrink-0">
                              {alertItem.alertData.labels.pod}
                            </span>
                          ) : isAlert && alertItem.alertData?.labels?.instance ? (
                            <span className="font-mono bg-muted/50 px-1 rounded mr-1 shrink-0">
                              {alertItem.alertData.labels.instance}
                            </span>
                          ) : null}

                          <span className="truncate italic">
                            {isEvent && eventItem.eventMessage ? eventItem.eventMessage : item.description}
                          </span>
                        </div>

                        {isEvent && eventItem.eventLastSeen && (
                          <span className="shrink-0 opacity-70 font-mono">
                            {getTimeSince(eventItem.eventLastSeen)}
                          </span>
                        )}
                        {/* Alert Timestamp if available */}
                        {isAlert && (alertItem.alertData?.activeAt || alertItem.alertData?.startsAt) && (
                          <span className="shrink-0 opacity-70 font-mono">
                            {getTimeSince(alertItem.alertData.activeAt || alertItem.alertData.startsAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {isResourceType && (
                    <span className="text-gray-400 text-xs text-right shrink-0">→</span>
                  )}
                  {isFailing && <AlertCircle size={10} className="flex-shrink-0" />}
                </div>
              );

              // Specific Tooltip for Alerts
              if (isAlert && alertItem.alertData) {
                return (
                  <TooltipProvider key={item.id}>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        {element}
                      </TooltipTrigger>
                      <TooltipContent side="right" className="w-80 p-0 border border-border bg-card text-popover-foreground">
                        <div className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            {getSeverityIcon(alertItem.alertSeverity)}
                            <span className="font-semibold text-sm">{alertItem.name}</span>
                          </div>

                          <div className="text-xs text-muted-foreground mb-3 leading-relaxed">
                            {alertItem.description}
                          </div>

                          <div className="space-y-2">
                            <div className="text-[10px] uppercase font-bold text-muted-foreground">Affected Resource</div>
                            <div className="grid grid-cols-2 gap-2">
                              {Object.entries(alertItem.alertData.labels || {})
                                .filter(([key]) => ['pod', 'namespace', 'service', 'instance', 'job', 'container', 'node'].includes(key))
                                .map(([key, value]) => (
                                  <div key={key} className="bg-muted/50 p-1.5 rounded">
                                    <div className="text-[9px] text-muted-foreground uppercase">{key}</div>
                                    <div className="text-xs font-mono truncate" title={value as string}>{value as string}</div>
                                  </div>
                                ))
                              }
                            </div>
                          </div>

                          <div className="mt-3 pt-2 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground">
                            <span>State: {alertItem.alertData.state}</span>
                            <span>{new Date(alertItem.alertData.activeAt || alertItem.alertData.startsAt || alertItem.alertData.updatedAt || '').toLocaleString()}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              }

              if (isResourceItem && (item as ResourceMentionItem).searchResult) {
                return (
                  <ResourceInfoTooltip key={item.id} resource={(item as ResourceMentionItem).searchResult!}>
                    {element}
                  </ResourceInfoTooltip>
                );
              }
              return element;
            };

            let currentIdx = 0;
            return (
              <div className="flex flex-col">
                {failingItems.length > 0 && (
                  <>
                    <div className="px-3 py-1 bg-red-500/5 text-[10px] text-red-500 font-bold uppercase border-b border-red-500/10 mb-1 flex items-center gap-1">
                      <AlertCircle size={10} /> Failing Pods
                    </div>
                    {failingItems.map((item) => renderItem(item, 0, currentIdx++))}
                    {otherItems.length > 0 && (
                      <div className="px-3 py-1 bg-foreground/5 text-[10px] text-muted-foreground font-bold uppercase border-y border-accent mt-1 mb-1">
                        Resources
                      </div>
                    )}
                  </>
                )}
                {otherItems.map((item) => renderItem(item, 0, currentIdx++))}
              </div>
            );
          })() : (
            <div style={{ padding: '0.75rem', color: '#718096' }} className="dark:text-gray-400 text-center">
              {dropdownMode === 'resources'
                ? currentContext
                  ? 'No resources found'
                  : 'Connect to a cluster to search resources'
                : 'No matching items'}
            </div>
          )}
        </div>
      )}

      <div style={{ position: 'relative', width: '100%' }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={useAnimatedSuggestions ? "" : placeholderStr} // Use static placeholder if no animated suggestions
          rows={1}
          className={`flex-grow border text-sm border-gray-400 min-h-9 p-2 rounded-[0.4rem] 
            overflow-y-auto
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-accent/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-accent/50
            dark:border-gray-800/50 bg-transparent dark:text-gray-200 
            focus:outline-none focus:ring-0 focus:border-gray-400 dark:focus:border-transparent
            resize-none ${useAnimatedSuggestions && !value ? 'text-transparent' : ''} ${className || ''}`}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: '200px',
            boxSizing: 'border-box',
            border: '0px solid transparent',
            padding: '0.5rem',
            fontSize: '0.875rem',
            lineHeight: '1.25rem',
            minHeight: '2.25rem',
            color: value ? 'inherit' : (useAnimatedSuggestions ? 'inherit' : 'inherit'),
            caretColor: 'inherit'
          }}
          disabled={disabled}
          {...props}
        />

        {/* Animated placeholder */}
        {useAnimatedSuggestions && !value && (
          <div
            className="absolute inset-0 p-2 pointer-events-none flex items-start"
            style={{
              paddingTop: '0.5rem',
              zIndex: 1
            }}
          >
            <span
              className={`text-sm text-gray-400 px-0.5 dark:text-gray-500 transition-all duration-300 ${isAnimating
                ? 'opacity-0 transform translate-y-1'
                : 'opacity-100 transform translate-y-0'
                }`}
            >
              {animatedSuggestions[currentSuggestion]}
            </span>
          </div>
        )}
      </div>


    </div>
  );
});

AutoResizeTextarea.displayName = 'AutoResizeTextarea';

export default AutoResizeTextarea;