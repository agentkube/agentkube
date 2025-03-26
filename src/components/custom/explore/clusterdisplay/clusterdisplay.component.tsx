// ClusterDisplay.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Check } from 'lucide-react';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { NavigateFunction } from 'react-router-dom';

// Add this new interface for cluster dropdown position
interface ClusterDropdownPosition {
  visible: boolean;
  x: number;
  y: number;
}

interface ClusterDisplayProps {
  isCollapsed: boolean;
  currentContext: any; // Type from your cluster context
  contexts: any[]; // Type from your cluster context
  setCurrentContext: (context: any) => void;
  navigate: NavigateFunction;
}

const ClusterDisplay: React.FC<ClusterDisplayProps> = ({
  isCollapsed,
  currentContext,
  contexts,
  setCurrentContext,
  navigate
}) => {
  const clusterDisplayRef = useRef<HTMLDivElement>(null);
  
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

  // Determine cluster type for display
  const getClusterType = (name: string) => {
    if (name.includes('kind')) return 'kind-cluster';
    if (name.includes('docker')) return 'docker-desktop';
    if (name.includes('aws')) return 'aws-cluster';
    return 'kubernetes-cluster';
  };

  return (
    <div
      ref={clusterDisplayRef}
      className={`relative flex items-center ${isCollapsed ? 'justify-center' : 'gap-2 px-4'} py-2 mb-2 cursor-pointer hover:bg-gray-800/10 dark:hover:bg-gray-800/20 group`}
      onContextMenu={handleClusterRightClick}
      onClick={() => navigate('/')}
    >
      <img src={KUBERNETES_LOGO} className="h-8 w-8" alt="Kubernetes logo" />

      {!isCollapsed && currentContext && (
        <div className="text-sm font-medium">
          <h3 className="text-gray-800 dark:text-gray-300">{currentContext.name}</h3>
          <p className="text-xs text-gray-800 dark:text-gray-500">{getClusterType(currentContext.name)}</p>
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
            <p className="text-xs text-gray-600 dark:text-gray-300">{getClusterType(currentContext.name)}</p>
          </div>
          <div className="absolute w-2 h-2 bg-gray-200 dark:bg-gray-900 rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
        </div>
      )}

      {/* Cluster Selection Dropdown */}
      {clusterDropdown.visible && contexts.length > 0 && (
        <div 
          className="absolute left-20 top-full mt-1 z-50 bg-white dark:bg-[#0B0D13]/30 backdrop-blur-md shadow-lg rounded-md border border-gray-200 dark:border-gray-800 w-64 max-h-80 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 text-sm font-medium text-gray-800 dark:text-gray-300 border-b border-gray-200 dark:border-gray-800">
            Select Cluster
          </div>
          <div className="py-1">
            {contexts.map((ctx) => (
              <div
                key={ctx.name}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  currentContext?.name === ctx.name ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                }`}
                onClick={() => handleClusterSelect(ctx.name)}
              >
                <img src={KUBERNETES_LOGO} className="h-5 w-5" alt="Kubernetes logo" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-300">{ctx.name}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-500">{getClusterType(ctx.name)}</p>
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