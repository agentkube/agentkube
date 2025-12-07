// ClusterDisplay.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import KUBERNETES_BLUE_LOGO from '@/assets/kubernetes-blue.png';
import { NavigateFunction } from 'react-router-dom';
import { AWS_PROVIDER, AWS_PROVIDER_DARK, AZURE_PROVIDER, DOCKER_PROVIDER, GCP_PROVIDER, KIND_PROVIDER, MINIKUBE_PROVIDER } from '@/assets/providers';
import { useTheme } from 'next-themes';

interface ClusterDropdownPosition {
  visible: boolean;
  x: number;
  y: number;
}

interface ClusterDisplayProps {
  isCollapsed: boolean;
  currentContext: any;
  contexts: any[];
  setCurrentContext: (context: any) => void;
  navigate: NavigateFunction;
}

// Interface for cluster types
type ClusterType = 'kind' | 'docker' | 'aws' | 'local' | 'gcp' | 'azure' | 'civo' | 'linode' | 'digitalocean' | 'oracle' | 'minikube';

const ClusterDisplay: React.FC<ClusterDisplayProps> = ({
  isCollapsed,
  currentContext,
  contexts,
  setCurrentContext,
  navigate
}) => {
  const clusterDisplayRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  // State for cluster context menu dropdown
  const [clusterDropdown, setClusterDropdown] = useState<ClusterDropdownPosition>({
    visible: false,
    x: 0,
    y: 0
  });

  // Handle right-click on cluster display
  const handleClusterRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setClusterDropdown({
      visible: true,
      x: e.clientX,
      y: e.clientY
    });
  };

  // Handle cluster selection
  const handleClusterSelect = (contextName: string) => {
    const selectedContext = contexts.find(ctx => ctx.name === contextName);
    if (selectedContext) {
      setCurrentContext(selectedContext);
    }
    setClusterDropdown({ ...clusterDropdown, visible: false });
  };

  // Close cluster dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clusterDropdown.visible &&
        clusterDisplayRef.current &&
        !clusterDisplayRef.current.contains(event.target as Node)) {
        setClusterDropdown({ ...clusterDropdown, visible: false });
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [clusterDropdown.visible]);

  // Determine cluster type for display - matching HomePage logic
  const determineClusterType = (name: string): ClusterType => {
    if (name.includes('kind')) return 'kind';
    if (name.includes('minikube')) return 'minikube';
    if (name.includes('gke')) return 'gcp';
    if (name.includes('aks')) return 'azure';
    if (name.includes('docker')) return 'docker';
    if (name.includes('aws') || name.includes('eks')) return 'aws';
    return 'local';
  };

  // Cluster Icon Component - matching HomePage logic
  const ClusterIcon: React.FC<{ type: ClusterType; size?: string }> = ({ type, size = "h-5 w-5" }) => {
    switch (type) {
      case 'kind':
        return <img className={size} src={KUBERNETES_BLUE_LOGO} alt="Kubernetes logo" />;
      case 'docker':
        return <img className={size} src={DOCKER_PROVIDER} alt="Docker logo" />;
      case 'minikube':
        return <img className={size} src={MINIKUBE_PROVIDER} alt="Minikube logo" />;
      case 'aws':
        return <img className={size} src={theme === 'dark' ? AWS_PROVIDER_DARK : AWS_PROVIDER} alt="AWS logo" />;
      case 'gcp':
        return <img className={size} src={GCP_PROVIDER} alt="GCP logo" />;
      case 'azure':
        return <img className={size} src={AZURE_PROVIDER} alt="Azure logo" />;
      default:
        return <img className={size} src={KUBERNETES_BLUE_LOGO} alt="Kubernetes logo" />;
    }
  };

  // Helper function to truncate long cluster names
  const truncateClusterName = (name: string, maxLength: number = 35) => {
    return name.length > maxLength ? name.slice(0, maxLength) + '...' : name;
  };

  return (
    <div
      ref={clusterDisplayRef}
      className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-4'} py-2 mb-2 cursor-pointer hover:bg-accent/10 group`}
      onContextMenu={handleClusterRightClick}
      onClick={() => navigate('/')}
    >

      <div className='rounded-xl dark:bg-accent/50 p-1.5'>
        {currentContext ? (
          <ClusterIcon type={determineClusterType(currentContext.kubeContext?.cluster)} size="h-8 w-8" />
        ) : (
          <img src={KUBERNETES_LOGO} className="h-8 w-8" alt="Kubernetes logo" />
        )}
      </div>

      {!isCollapsed && currentContext && (
        <div className="text-sm font-medium">
          <h3 className="text-gray-800 dark:text-gray-300">{currentContext.name.length > 30 ? currentContext.name.slice(0, 30) + '...' : currentContext.name}</h3>
          <p className="text-xs text-muted-foreground/60">
            {currentContext.kubeContext?.cluster ? truncateClusterName(currentContext.kubeContext.cluster, 30) : determineClusterType(currentContext.name)}
          </p>
        </div>
      )}

      {!isCollapsed && !currentContext && (
        <div className="text-sm font-medium">
          <h3 className="text-gray-800 dark:text-gray-300">No cluster selected</h3>
          <p className="text-xs text-gray-800 dark:text-gray-500">Click to select a cluster</p>
        </div>
      )}

      {isCollapsed && currentContext && (
        <div className="absolute left-full ml-2 z-10 bg-gray-200 dark:bg-gray-900 dark:text-white text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
          <div>
            <p className="font-medium">{currentContext.name}</p>
            <p className="text-xs text-muted-foreground">
              {currentContext.kubeContext?.cluster ? truncateClusterName(currentContext.kubeContext.cluster, 20) : determineClusterType(currentContext.name)}
            </p>
          </div>
          <div className="absolute w-2 h-2 bg-gray-200 dark:bg-gray-900 rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
        </div>
      )}

      {/* Cluster Selection Dropdown */}
      {clusterDropdown.visible && contexts.length > 0 && (
        <div
          className="absolute 
          left-20 top-full mt-1 z-50 bg-white dark:bg-card/40 backdrop-blur-md shadow-lg rounded-md border border-accent/50
           w-64
          "
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 text-xs font-medium text-gray-800 dark:text-gray-300 border-b border-accent/50">
            Select Cluster
          </div>
          <div className="
           max-h-80 overflow-y-auto
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
          ">
            {contexts.map((ctx) => (
              <div
                key={ctx.name}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${currentContext?.name === ctx.name ? 'bg-muted-foreground/10' : ''
                  }`}
                onClick={() => handleClusterSelect(ctx.name)}
              >
                <div className='rounded-xl dark:bg-gray-700/30 p-2'>
                  <ClusterIcon type={determineClusterType(ctx.kubeContext?.cluster)} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-300">{ctx.name}</p>
                  <p className="text-xs text-muted-foreground/60 truncate max-w-40">
                    {ctx.kubeContext?.cluster}
                  </p>
                </div>
                {currentContext?.name === ctx.name && (
                  <Check className="w-4 h-4 text-green-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClusterDisplay;