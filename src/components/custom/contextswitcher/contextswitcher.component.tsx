import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import { KubeContext } from '@/types/cluster';
import { useTheme } from 'next-themes';
import {
  AWS_PROVIDER,
  AWS_PROVIDER_DARK,
  AZURE_PROVIDER,
  DOCKER_PROVIDER,
  GCP_PROVIDER,
  MINIKUBE_PROVIDER
} from '@/assets/providers';
import KUBERNETES_LOGO from '@/assets/kubernetes-blue.png';

interface ContextSwitcherProps {
  contexts: KubeContext[];
  currentContext: KubeContext | null;
  onContextSelect: (context: KubeContext) => void;
  query: string;
  activeIndex: number;
}

// Helper function to determine cluster type from context name
const determineClusterType = (name: string): string => {
  if (name.includes('kind')) return 'kind';
  if (name.includes('minikube')) return 'minikube';
  if (name.includes('gke')) return 'gcp';
  if (name.includes('aks')) return 'azure';
  if (name.includes('docker')) return 'docker';
  if (name.includes('aws')) return 'aws';
  return 'local';
};

const ContextSwitcher: React.FC<ContextSwitcherProps> = ({
  contexts,
  currentContext,
  onContextSelect,
  query,
  activeIndex
}) => {
  const { theme } = useTheme();
  const filteredContexts = useMemo(() =>
    contexts.filter(ctx =>
      ctx.name.toLowerCase().includes(query.toLowerCase())
    ),
    [contexts, query]
  );

  // Component for cluster icon
  const ClusterIcon = ({ type }: { type: string }) => {
    switch (type) {
      case 'kind':
        return <img className='w-6' src={KUBERNETES_LOGO} alt="Kind logo" />;
      case 'docker':
        return <img className='h-6 w-6' src={DOCKER_PROVIDER} alt="Docker logo" />;
      case 'minikube':
        return <img className='h-6 w-6' src={MINIKUBE_PROVIDER} alt="Minikube logo" />;
      case 'aws':
        return <img className='h-6 w-6' src={theme === 'dark' ? AWS_PROVIDER_DARK : AWS_PROVIDER} alt="AWS logo" />;
      case 'gcp':
        return <img className='h-6 w-6' src={GCP_PROVIDER} alt="GCP logo" />;
      case 'azure':
        return <img className='h-6 w-6' src={AZURE_PROVIDER} alt="Azure logo" />;
      default:
        return <img className='h-6 w-6' src={KUBERNETES_LOGO} alt="Kubernetes logo" />;
    }
  };

  return (
    <div className="py-1">
      {filteredContexts.length === 0 ? (
        <div className="text-gray-500 p-4 text-center">
          No contexts found matching "{query}"
        </div>
      ) : (
        filteredContexts.map((context, index) => {
          const clusterType = determineClusterType(context.kubeContext.user);

          return (
            <div
              key={context.name}
              className={`flex items-center px-4 py-2 cursor-pointer ${index === activeIndex ? 'bg-accent' : 'hover:bg-accent-hover'
                }`}
              onClick={() => onContextSelect(context)}
            >
              <div className="w-6 h-6 mr-3 flex items-center justify-center">
                <ClusterIcon type={clusterType} />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{context.name}</span>
                  {currentContext?.name === context.name && (
                    <Check className="w-4 h-4 text-green-500" />
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {context.server}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};

export default ContextSwitcher;