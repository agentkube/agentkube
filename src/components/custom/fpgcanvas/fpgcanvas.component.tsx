import React, { useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  Node,
  Edge,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FaultPropagationGraph, FPGNode as FPGNodeData } from '@/types/task';
import { AlertTriangle, AlertCircle, Info, XCircle } from 'lucide-react';

interface FPGCanvasProps {
  faultPropagationGraph: FaultPropagationGraph;
}

// Custom node component for FPG nodes
const FPGNodeComponent = ({ data }: { data: any }) => {
  const getSeverityIcon = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'border-red-600';
      case 'warning':
        return 'border-orange-500';
      case 'error':
        return 'border-red-500';
      default:
        return 'border-blue-500';
    }
  };

  const getSeverityTextColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'text-red-600';
      case 'warning':
        return 'text-orange-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-blue-500';
    }
  };

  const isRootCause = data.isRootCause;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 min-w-[280px] max-w-[400px]
        ${getSeverityColor(data.severity)}
        shadow-md hover:shadow-lg transition-shadow bg-gray-200
      `}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-none w-12 h-12"
      />

      {/* Header */}
      <div className="flex items-center  gap-2 mb-2">
        {getSeverityIcon(data.severity)}
        <div className="flex items-center gap-2">
          <div className={`font-semibold ${getSeverityTextColor(data.severity)} text-sm text-gray-800`}>
            {data.event_type.replace(/_/g, ' ')}
          </div>
          {isRootCause && (
            <div className="text-xs font-medium text-purple-600 bg-purple-500/30 rounded-md px-1.5">
              Root Cause
            </div>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="text-xs text-gray-600 mb-2 font-mono">
        {data.location}
      </div>

      {/* Details */}
      <div className="space-y-1">
        {data.details.reason && (
          <div className="text-xs">
            <span className="font-medium text-gray-400">Reason</span>{' '}
            <span className="text-gray-700">{data.details.reason}</span>
          </div>
        )}
        {data.details.message && (
          <div className="text-xs">
            <span className="font-medium text-gray-700">Message</span>{' '}
            <span className="text-gray-600 line-clamp-2">{data.details.message}</span>
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="text-xs text-gray-500 mt-2">
        {new Date(data.timestamp).toLocaleString()}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-none w-12 h-12"
      />
    </div>
  );
};

const nodeTypes = {
  fpgNode: FPGNodeComponent,
};

type FPGNodeWithRoot = FPGNodeData & { isRootCause?: boolean };

export const FPGCanvas: React.FC<FPGCanvasProps> = ({
  faultPropagationGraph,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<FPGNodeWithRoot>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const calculateNodePositions = useCallback((fpg: FaultPropagationGraph): Node<FPGNodeWithRoot>[] => {
    const HORIZONTAL_SPACING = 480;
    const VERTICAL_SPACING = 150;

    // Build adjacency map to understand the graph structure
    const adjacencyMap = new Map<string, string[]>();
    fpg.edges.forEach(edge => {
      if (!adjacencyMap.has(edge.from)) {
        adjacencyMap.set(edge.from, []);
      }
      adjacencyMap.get(edge.from)?.push(edge.to);
    });

    // Perform topological sort to determine layers
    const visited = new Set<string>();
    const layers = new Map<string, number>();

    const calculateLayer = (nodeId: string, currentLayer: number = 0): number => {
      if (layers.has(nodeId)) {
        return layers.get(nodeId)!;
      }

      const children = adjacencyMap.get(nodeId) || [];
      if (children.length === 0) {
        layers.set(nodeId, currentLayer);
        return currentLayer;
      }

      let maxChildLayer = currentLayer;
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          const childLayer = calculateLayer(child, currentLayer + 1);
          maxChildLayer = Math.max(maxChildLayer, childLayer);
        }
      }

      layers.set(nodeId, currentLayer);
      return maxChildLayer;
    };

    // Calculate layers for all root causes
    fpg.root_causes.forEach(rootId => {
      if (!visited.has(rootId)) {
        visited.add(rootId);
        calculateLayer(rootId);
      }
    });

    // Handle orphan nodes (nodes not connected to root causes)
    fpg.nodes.forEach(node => {
      if (!layers.has(node.id)) {
        layers.set(node.id, 0);
      }
    });

    // Group nodes by layer
    const nodesByLayer = new Map<number, FPGNodeData[]>();
    fpg.nodes.forEach(node => {
      const layer = layers.get(node.id) || 0;
      if (!nodesByLayer.has(layer)) {
        nodesByLayer.set(layer, []);
      }
      nodesByLayer.get(layer)?.push(node);
    });

    // Create positioned nodes
    const positionedNodes: Node<FPGNodeData & { isRootCause?: boolean }>[] = [];

    nodesByLayer.forEach((layerNodes, layer) => {
      layerNodes.forEach((nodeData, index) => {
        const isRootCause = fpg.root_causes.includes(nodeData.id);

        positionedNodes.push({
          id: nodeData.id,
          type: 'fpgNode',
          position: {
            x: layer * HORIZONTAL_SPACING,
            y: index * VERTICAL_SPACING,
          },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            ...nodeData,
            isRootCause,
          },
        });
      });
    });

    return positionedNodes;
  }, []);

  const formattedEdges = useMemo((): Edge[] => {
    if (!faultPropagationGraph) return [];

    return faultPropagationGraph.edges.map((edge, index) => ({
      id: `e-${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      type: 'default',
      animated: true,
      label: edge.relation_type,
      style: {
        stroke: '#8b5cf6',
        strokeWidth: 2,
        strokeDasharray: '5,5', // Dotted line style
      },
      labelStyle: {
        fill: '#8b5cf6',
        fontWeight: 600,
        fontSize: 12,
      },
      labelBgStyle: {
        fill: '#ffffff',
        opacity: 0.9,
      },
      labelBgPadding: [8, 4] as [number, number],
      labelBgBorderRadius: 4,
    }));
  }, [faultPropagationGraph]);

  useEffect(() => {
    if (faultPropagationGraph && faultPropagationGraph.nodes.length > 0) {
      const positionedNodes = calculateNodePositions(faultPropagationGraph);
      setNodes(positionedNodes);
      setEdges(formattedEdges);
    }
  }, [faultPropagationGraph, calculateNodePositions, formattedEdges, setNodes, setEdges]);

  if (!faultPropagationGraph || faultPropagationGraph.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
        <div className="text-center space-y-2">
          <AlertCircle className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600" />
          <p className="text-sm">No fault propagation data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          duration: 500,
        }}
        minZoom={0.4}
        maxZoom={0.7}
      >
        <Controls
          style={{
            backgroundColor: '#ffffff',
            color: 'black',
            borderRadius: '0.5rem'
          }}
        />
        <Background
          color="#d1d5db"
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
        />
      </ReactFlow>
    </div>
  );
};

export default FPGCanvas;
