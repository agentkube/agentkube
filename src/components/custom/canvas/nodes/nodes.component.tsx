// components/nodes.tsx
import React from 'react';
import { memo } from 'react';
import { Handle, NodeTypes, Position } from '@xyflow/react';
import { KubeResourceIconMap, KubeResourceType } from '@/constants/kuberesource-icon-map.constant';
import Internet from '@/assets/resources/internet.png';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { Container as ContainerIcon, Image } from 'lucide-react';

interface ResourceNodeProps {
  data: K8sResourceData;
  onAttackPathClick?: (resourceData: K8sResourceData) => void;
}

export const getEdgeStyle = (label?: string) => {
  // Maintain the dotted and flowing style for all edges
  const baseStyle = {
    stroke: '#4f46e5CC', // Indigo-600 - consistent color for all edges
    strokeWidth: 2,
    strokeDasharray: '5,5', // Dotted line style
    animated: true, // Flowing animation for all edges
  };

  // You can still differentiate by label if needed, but keep visual consistency
  switch (label) {
    case 'manages':
    case 'routes-to':
    case 'uses':
    case 'affects':
    case 'exposes':
    case 'configures':
    case 'provides-secrets':
    case 'contains':
    case 'creates':
    case 'running':
    default:
      return baseStyle;
  }
};

export const ResourceNode = memo(({ data, onAttackPathClick }: ResourceNodeProps) => {
  const { resourceType, resourceName } = data;
  const iconKey = resourceType.toLowerCase() as KubeResourceType;
  const icon = KubeResourceIconMap[iconKey] || KubeResourceIconMap.default;
  const isLucideIcon = typeof icon === 'function';

  const handleClick = (event: React.MouseEvent) => {
    // Check for cmd+click (macOS) or ctrl+click (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && onAttackPathClick) {
      event.preventDefault();
      event.stopPropagation();
      onAttackPathClick(data);
    }
  };

  //Option 1 Get the resource by getK8sResource
  return (
    <div 
      className="px-4 py-2 shadow-lg bg-gray-100 border-2 border-gray-400/50 rounded-[0.5rem] cursor-pointer"
      onClick={handleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-none w-12 h-12"
        style={{ zIndex: -1 }}
      />
      <div className="flex items-center w-56 truncate gap-3">
        <div className="flex-shrink-0">
          {isLucideIcon ? (
            React.createElement(icon as React.ComponentType<any>, { 
              className: "w-8 h-8 text-gray-700" 
            })
          ) : (
            <img src={icon as string} alt={resourceType} className="w-8 h-8" />
          )}
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-bold text-gray-700">{resourceType}</div>
          <div className="text-xs text-gray-500">{resourceName}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-none w-12 h-12"
        style={{ zIndex: -1 }}
      />
    </div>
  );
});

ResourceNode.displayName = 'ResourceNode';


interface NamespaceNodeProps {
  data: {
    label: string;
  };
}

// TODO Namespace width and height to be passed as props
export const NamespaceNode = ({ data }: NamespaceNodeProps) => {
  return (
    <>
      <div className="text-xs font-medium text-purple-600 ml-2">
        Namespace: {data.label}
      </div>
      <div className="bg-purple-100/40 border-2 border-purple-400 rounded-xl p-2 min-w-[200px] min-h-[600px]">
      </div>
    </>
  );
};

export const InternetNode = () => {
  return (
    <>
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border px-4 py-2">
        <img src={Internet} alt="Internet icon" className="w-8 h-8" />
        <p className="text-xs font-medium text-center text-gray-600">Internet</p>
      </div>
    </>
  );
};

interface ContainerNodeProps {
  data: {
    name: string;
    image: string;
    podName: string;
    namespace: string;
  };
  onAttackPathClick?: (resourceData: any) => void;
}

export const ContainerNode = memo(({ data, onAttackPathClick }: ContainerNodeProps) => {
  const handleClick = (event: React.MouseEvent) => {
    // Check for cmd+click (macOS) or ctrl+click (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && onAttackPathClick) {
      event.preventDefault();
      event.stopPropagation();
      // Convert container data to K8sResourceData format
      const resourceData = {
        resourceType: 'container',
        resourceName: data.name,
        namespace: data.namespace,
        name: data.name,
        podName: data.podName,
        image: data.image
      };
      onAttackPathClick(resourceData);
    }
  };

  return (
    <div 
      className="px-4 py-2 shadow-lg bg-gray-100 border-2 border-gray-400/50 rounded-[0.5rem] cursor-pointer"
      onClick={handleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-none w-12 h-12"
        style={{ zIndex: -1 }}
      />
      <div className="flex items-center w-56 truncate gap-3">
        <div className="flex-shrink-0">
          <ContainerIcon className="w-8 h-8 text-blue-700" />
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-bold text-gray-700">Container</div>
          <div className="text-xs text-gray-500">{data.name}</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-none w-12 h-12"
        style={{ zIndex: -1 }}
      />
    </div>
  );
});

ContainerNode.displayName = 'ContainerNode';

interface ImageNodeProps {
  data: {
    image: string;
    container: string;
    vulnerabilityCount?: number;
  };
  onAttackPathClick?: (resourceData: any) => void;
}

export const ImageNode = memo(({ data, onAttackPathClick }: ImageNodeProps) => {
  // Extract just the image name and tag for display
  const imageParts = data.image.split('/');
  const imageNameTag = imageParts[imageParts.length - 1] || data.image;

  const handleClick = (event: React.MouseEvent) => {
    // Check for cmd+click (macOS) or ctrl+click (Windows/Linux)
    if ((event.metaKey || event.ctrlKey) && onAttackPathClick) {
      event.preventDefault();
      event.stopPropagation();
      // Convert image data to K8sResourceData format
      const resourceData = {
        resourceType: 'image',
        resourceName: imageNameTag,
        image: data.image,
        container: data.container
      };
      onAttackPathClick(resourceData);
    }
  };
  
  return (
    <div 
      className="px-4 py-2 shadow-lg bg-gray-100 border-2 border-gray-400/50 rounded-[0.5rem] cursor-pointer relative"
      onClick={handleClick}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-none w-12 h-12"
        style={{ zIndex: -1 }}
      />
      <div className="flex items-center w-56 truncate gap-3">
        <div className="flex-shrink-0">
          <Image className="w-8 h-8 text-cyan-500" />
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-bold text-gray-700">Image</div>
          <div className="text-xs text-gray-500" title={data.image}>{imageNameTag}</div>
        </div>
      </div>
      
      {/* Vulnerability Count Badge */}
      {data.vulnerabilityCount !== undefined && data.vulnerabilityCount > 0 && (
        <div className="absolute -top-4 -right-4 bg-rose-500 text-white text-md font-bold rounded-full w-10 h-10 flex items-center justify-center border-2 border-white shadow-sm">
          {data.vulnerabilityCount > 99 ? '99+' : data.vulnerabilityCount}
        </div>
      )}
      
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-none w-12 h-12"
        style={{ zIndex: -1 }}
      />
    </div>
  );
});

ImageNode.displayName = 'ImageNode';

// Create wrapper components that extract the handler from node data
const ResourceNodeWrapper = ({ data, ...props }: any) => (
  <ResourceNode data={data} onAttackPathClick={data.onAttackPathClick} {...props} />
);

const ContainerNodeWrapper = ({ data, ...props }: any) => (
  <ContainerNode data={data} onAttackPathClick={data.onAttackPathClick} {...props} />
);

const ImageNodeWrapper = ({ data, ...props }: any) => (
  <ImageNode data={data} onAttackPathClick={data.onAttackPathClick} {...props} />
);

export const nodeTypes: NodeTypes = {
  resource: ResourceNodeWrapper,
  container: ContainerNodeWrapper,
  image: ImageNodeWrapper,
};