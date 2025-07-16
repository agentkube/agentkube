import React, { useState, useRef, useEffect } from 'react';
import { Plus, ChevronRight, ChevronDown, Container } from 'lucide-react';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { useCluster } from '@/contexts/clusterContext';
import { listResources } from '@/api/internal/resources';
import { OPERATOR_URL } from '@/config';

interface Pod {
  name: string;
  namespace: string;
  containers: string[];
  expanded?: boolean;
}

interface LogsSelection {
  podName: string;
  namespace: string;
  containerName: string;
  logs: string;
}

interface AddResourceLogsPickerProps {
  onLogsSelect: (selection: LogsSelection) => void;
}

const AddResourceLogsPicker: React.FC<AddResourceLogsPickerProps> = ({ onLogsSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pods, setPods] = useState<Pod[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingContainer, setLoadingContainer] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { currentContext } = useCluster();

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

  // Fetch pods when dropdown opens or search query changes
  useEffect(() => {
    if (!isOpen || !currentContext) return;

    const fetchPods = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Get all pods from all namespaces
        const response = await listResources(
          currentContext.name,
          'pods',  // Changed from 'Pod' to 'pods'
          {
            // No specific namespace to get all pods
          }
        );
        
        // Filter pods based on search query and extract container info
        const filteredPods: Pod[] = response
          .filter((pod: any) => {
            const podName = pod.metadata?.name || '';
            const namespace = pod.metadata?.namespace || '';
            const query = searchQuery.toLowerCase();
            
            return podName.toLowerCase().includes(query) || 
                   namespace.toLowerCase().includes(query);
          })
          .map((pod: any) => {
            const containers = pod.spec?.containers?.map((c: any) => c.name) || [];
            const initContainers = pod.spec?.initContainers?.map((c: any) => c.name) || [];
            
            return {
              name: pod.metadata?.name || '',
              namespace: pod.metadata?.namespace || '',
              containers: [...containers, ...initContainers],
              expanded: false
            };
          })
          .slice(0, 20); // Limit to first 20 pods
        
        setPods(filteredPods);
      } catch (err) {
        console.error('Error fetching pods:', err);
        setError('Connect to cluster to search pods');
      } finally {
        setIsLoading(false);
      }
    };
    
    // Add debounce for search
    const timeout = setTimeout(() => {
      fetchPods();
    }, 300);
    
    return () => clearTimeout(timeout);
  }, [searchQuery, isOpen, currentContext]);

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
    // Reset search when opening dropdown
    if (!isOpen) {
      setSearchQuery('');
      setPods([]);
    }
  };

  const togglePodExpansion = (podIndex: number) => {
    setPods(prev => prev.map((pod, index) => 
      index === podIndex ? { ...pod, expanded: !pod.expanded } : pod
    ));
  };

  const fetchPodLogs = async (podName: string, namespace: string, containerName: string): Promise<string> => {
    if (!currentContext) return '';
    
    try {
      const params = new URLSearchParams();
      params.append('container', containerName);
      params.append('tailLines', '100');
      params.append('timestamps', 'true');

      const response = await fetch(
        `${OPERATOR_URL}/clusters/${currentContext.name}/api/v1/namespaces/${namespace}/pods/${podName}/log?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'text/plain',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.statusText}`);
      }

      return await response.text();
    } catch (err) {
      console.error('Error fetching pod logs:', err);
      throw err;
    }
  };

  const handleContainerSelect = async (pod: Pod, containerName: string) => {
    setLoadingContainer(`${pod.name}-${containerName}`);
    
    try {
      const logs = await fetchPodLogs(pod.name, pod.namespace, containerName);
      
      const selection: LogsSelection = {
        podName: pod.name,
        namespace: pod.namespace,
        containerName,
        logs
      };
      
      onLogsSelect(selection);
      setIsOpen(false);
    } catch (error) {
      console.error('Error fetching container logs:', error);
      setError(`Failed to fetch logs for ${containerName}`);
    } finally {
      setLoadingContainer(null);
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button 
        onClick={toggleDropdown}
        className="flex items-center text-gray-400 hover:text-gray-300 transition-colors rounded px-2 py-1"
      >
        <Plus size={14} className="mr-1" />
        <span className="text-xs">Add Logs</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 bottom-full mb-1 w-[25rem] rounded-md shadow-lg bg-gray-100/60 dark:bg-[#0B0D13]/80 backdrop-blur-sm border border-gray-300 dark:border-gray-800/50 z-50">
          <div className="p-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search pods by name or namespace"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-3 pr-3 py-2 bg-gray-200 dark:bg-gray-800/40 rounded text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
                autoFocus
              />
            </div>
          </div>
          
          <div className="max-h-48 overflow-y-auto py-1
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
            
            {isLoading && (
              <div className="px-3 py-2 text-xs text-gray-500 flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Searching pods...
              </div>
            )}
            
            {error && (
              <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}
            
            {!isLoading && !error && pods.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">
                No pods found matching "{searchQuery}"
              </div>
            )}
            
            {!isLoading && !error && pods.map((pod, podIndex) => (
              <div key={`${pod.namespace}-${pod.name}`} className="border-b border-gray-200/50 dark:border-gray-700/50 last:border-b-0">
                {/* Pod Header */}
                <div
                  className="px-2 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-gray-300/80 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300"
                  onClick={() => togglePodExpansion(podIndex)}
                >
                  <div className="flex items-center">
                    <div className="mr-2">
                      {pod.expanded ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                    </div>
                    <img src={KUBERNETES_LOGO} alt="Kubernetes Logo" className="w-4 h-4" />
                    <span 
                      className="ml-2 text-xs font-medium w-48 truncate hover:truncate-none hover:overflow-visible hover:whitespace-normal"
                    >
                      {pod.name}
                    </span>
                  </div>
                  <div className="text-gray-500 text-xs">
                    {pod.namespace} • {pod.containers.length}
                  </div>
                </div>

                {/* Container List */}
                {pod.expanded && (
                  <div className="bg-gray-50/50 dark:bg-gray-800/20">
                    {pod.containers.map((container) => (
                      <div
                        key={container}
                        className="px-4 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-gray-200/60 dark:hover:bg-gray-700/60 text-gray-600 dark:text-gray-300 border-l-2 border-gray-300/50 dark:border-gray-600/50 ml-3"
                        onClick={() => handleContainerSelect(pod, container)}
                      >
                        <div className="flex items-center space-x-1">
                          {/* <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div> */}
                          <Container className='h-3.5' />
                          <span className="text-xs">{container}</span>
                        </div>
                        <div className="text-gray-500 text-xs">
                          {loadingContainer === `${pod.name}-${container}` ? (
                            <svg className="animate-spin h-3 w-3 text-gray-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            'Click to add logs'
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddResourceLogsPicker;