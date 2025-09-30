// components/nodes.tsx
import React from 'react';
import { memo } from 'react';
import { Handle, NodeTypes, Position } from '@xyflow/react';
import { KubeResourceIconMap, KubeResourceType } from '@/constants/kuberesource-icon-map.constant';
import Internet from '@/assets/resources/internet.png';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';

interface ResourceNodeProps {
  data: K8sResourceData;
}

export const getEdgeStyle = (label?: string) => {
  switch (label) {
    case 'manages':
      return {
        stroke: '#4f46e5CC', // Indigo-600
        strokeWidth: 2,
        animated: true,
      };
    case 'routes-to':
      return {
        stroke: '#10b981', // Emerald-500
        strokeWidth: 2,
      };
    case 'uses':
      return {
        stroke: '#6366f1', // Indigo-500
        strokeWidth: 2,
      };
    case 'affects':
      return {
        stroke: '#f59e0b', // Amber-500
        strokeWidth: 2,
      };
    default:
      return {
        stroke: '#94a3b8', // Slate-400
        strokeWidth: 2,
      };
  }
};

export const ResourceNode = memo(({ data }: ResourceNodeProps) => {
  const { resourceType, resourceName } = data;
  const iconKey = resourceType.toLowerCase() as KubeResourceType;
  const icon = KubeResourceIconMap[iconKey] || KubeResourceIconMap.default;

  //Option 1 Get the resource by getK8sResource
  return (
    <div className="px-4 py-2 shadow-lg bg-gray-100 border-2 border-gray-400/50 rounded-[0.5rem]">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-none w-12 h-12"
        style={{ zIndex: -1 }}
      />
      <div className="flex items-center w-56 truncate gap-3">
        <div className="flex-shrink-0">
          <img src={icon} alt={resourceType} className="w-8 h-8" />
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

export const nodeTypes: NodeTypes = {
  resource: ResourceNode,
};