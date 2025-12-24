import React, { useRef, useState, useEffect, ChangeEvent, FocusEvent, KeyboardEvent, useImperativeHandle, useCallback } from 'react';
import { useCluster } from '@/contexts/clusterContext';
import { queryResource, listResources } from '@/api/internal/resources';
import { SearchResult, EnrichedSearchResult } from '@/types/search';
import { jsonToYaml } from '@/utils/yaml';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

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

type DropdownMode = 'functions' | 'resourceTypes' | 'resources';

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
  const [isLoadingResources, setIsLoadingResources] = useState(false);
  const [insertedResources, setInsertedResources] = useState<Set<string>>(new Set()); // Track inserted resource refs

  const { currentContext } = useCluster();

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
    // @pods/ - resource type with trailing slash (show resources)
    // @pods/nginx - resource type with search term (search resources)
    // @pods - might be resource type or function name
    // @functionName - function mention

    const resourceWithSearchMatch = textBeforeCursor.match(/@(\w+)\/(\w*)$/);
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

    const simpleMatch = textBeforeCursor.match(/@(\w*)$/);
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

  // Search for Kubernetes resources
  const searchResources = useCallback(async (resourceType: string, query: string) => {
    if (!currentContext) return;

    setIsLoadingResources(true);
    try {
      const response = await queryResource(
        currentContext.name,
        query || resourceType, // Use resource type as default search if no query
        30, // limit
        resourceType
      );

      const results: ResourceMentionItem[] = (response.results || []).map((result: SearchResult) => ({
        id: `${result.resourceType}/${result.namespace || 'cluster'}/${result.resourceName}`,
        name: result.resourceName,
        description: result.namespace ? `${result.namespace}` : 'cluster-scoped',
        resourceType: result.resourceType,
        namespace: result.namespace,
        searchResult: result
      }));

      setResourceSearchResults(results);
    } catch (error) {
      console.error('Error searching resources:', error);
      setResourceSearchResults([]);
    } finally {
      setIsLoadingResources(false);
    }
  }, [currentContext]);

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

      if (mentionPattern.type === 'resources') {
        // User typed @resourceType/
        setDropdownMode('resources');
        setSelectedResourceType(mentionPattern.resourceType);
        setSearchTerm(mentionPattern.searchQuery);
        searchResources(mentionPattern.resourceType, mentionPattern.searchQuery);
      } else if (mentionPattern.type === 'initial') {
        // User typed @something - check if it matches a resource type
        const matchingTypes = KUBERNETES_RESOURCE_TYPES.filter(rt =>
          rt.id.startsWith(mentionPattern.term) || rt.label.toLowerCase().startsWith(mentionPattern.term)
        );

        const matchingFunctions = mentionItems.filter((item: MentionItem) =>
          item.name.toLowerCase().includes(mentionPattern.term)
        );

        // If term exactly matches a resource type and ends with nothing, show resource types
        if (matchingTypes.length > 0 || matchingFunctions.length === 0) {
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
      return filtered.map(rt => ({
        id: rt.id,
        name: `${rt.id}/`,
        description: rt.description,
        resourceType: rt.id,
        isResourceType: true
      }));
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
      const newText =
        currentValue.substring(0, lastAtPos) +
        `@${item.resourceType}/` +
        textAfterCursor;

      const syntheticEvent = {
        target: { value: newText }
      } as ChangeEvent<HTMLTextAreaElement>;

      onChange(syntheticEvent);

      // Switch to resource search mode
      setDropdownMode('resources');
      setSelectedResourceType(item.resourceType);
      setSearchTerm('');
      setSelectedIndex(0);

      // Trigger initial resource fetch
      searchResources(item.resourceType, '');

      // Set focus back to textarea
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = lastAtPos + item.resourceType.length + 2; // +2 for @ and /
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
      // The resource reference we want to insert
      const resourceRef = `@${item.resourceType}/${item.name}`;

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
      if (onResourceSelect && item.searchResult) {
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
        return 'Resource Types';
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
            width: dropdownMode === 'resources' ? '60%' : '50%',
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
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
          "
        >
          <div
            style={{
              padding: '0.5rem',
            }}
            className="font-bold dark:bg-card dark:border-accent dark:text-foreground text-foreground sticky -top-1 bg-white dark:bg-card border-b border-gray-100 dark:border-gray-800"
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
          ) : filteredItems.length > 0 ? (
            filteredItems.map((item, index) => {
              const isResourceItem = 'resourceType' in item;
              const isResourceType = isResourceItem && (item as ResourceMentionItem).isResourceType;

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                  }}
                  className={`flex items-center gap-2 ${selectedIndex === index
                    ? 'dark:bg-foreground/10 bg-foreground/50'
                    : 'hover:bg-foreground dark:hover:bg-foreground/10'}`
                  }
                  onClick={() => {
                    if (isResourceType) {
                      insertResourceType(item as ResourceMentionItem);
                    } else if (isResourceItem && (item as ResourceMentionItem).searchResult) {
                      insertResource(item as ResourceMentionItem);
                    } else {
                      insertMention(item as MentionItem);
                    }
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {isResourceItem && (
                    <img src={KUBERNETES_LOGO} alt="K8s" className="w-4 h-4 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Resource Name */}
                    <div style={{ fontWeight: 500 }} className="dark:text-gray-200 truncate">
                      {item.name}
                    </div>

                    {/* Namespace */}
                    {item.description && (
                      <div className="text-xs text-foreground/50 dark:text-foreground/50 truncate">{item.description}</div>
                    )}
                  </div>
                  {isResourceType && (
                    <span className="text-gray-400 text-xs">→</span>
                  )}
                </div>
              );
            })
          ) : (
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
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
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