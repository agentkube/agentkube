import React, { useState, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  // MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  // NodeTypes,
  Connection,
  Node,
  Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getResourceCanvas } from '@/api/internal/canvas';
import { K8sGraphData, K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { useCluster } from '@/contexts/clusterContext';
import { getEdgeStyle, nodeTypes } from './nodes/nodes.component';
import { ResourceDetailsPanel } from './panel/resource-panel.component';

interface ResourceCanvasProps {
  resourceDetails?: {
    namespace: string | null;
    group: string;
    version: string;
    resourceType: string;
    resourceName: string;
  };
}

export const ResourceCanvas = ({ resourceDetails }: ResourceCanvasProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<K8sResourceData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<K8sResourceData | null>(null);
  const { currentContext } = useCluster();


  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<K8sResourceData>) => {
    setSelectedResource(node.data);
  }, []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  const calculateNodePositions = (graphData: K8sGraphData): Node<K8sResourceData>[] => {
    const VERTICAL_SPACING = 100;
    const HORIZONTAL_SPACING = 400;

    // Group nodes by resource type
    const nodesByType = new Map<string, K8sResourceData[]>();
    graphData.nodes.forEach(node => {
      const type = node.data.resourceType;
      if (!nodesByType.has(type)) {
        nodesByType.set(type, []);
      }
      nodesByType.get(type)?.push(node.data);
    });

    // Create an array of nodes with positions
    const positionedNodes: Node<K8sResourceData>[] = [];
    let columnIndex = 0;

    nodesByType.forEach((nodes, _) => {
      nodes.forEach((nodeData, rowIndex) => {
        const node = graphData.nodes.find(n => n.data === nodeData);
        if (node) {
          positionedNodes.push({
            id: node.id,
            type: node.type, // 'changed from resource'
            position: {
              x: columnIndex * HORIZONTAL_SPACING,
              y: rowIndex * VERTICAL_SPACING
            },
            data: nodeData,
          });
        }
      });
      columnIndex++;
    });

    return positionedNodes;
  };

  useEffect(() => {
    const fetchResourceGraph = async () => {
      if (!currentContext || !resourceDetails) return;
  
      try {
        setIsLoading(true);
        setError(null);
  
        const graphData: K8sGraphData = await getResourceCanvas(
          currentContext.name,
          resourceDetails.namespace || "",
          resourceDetails.group,
          resourceDetails.version,
          resourceDetails.resourceType,
          resourceDetails.resourceName
        );
  
        const positionedNodes = calculateNodePositions(graphData);
        setNodes(positionedNodes);
  
        const formattedEdges: Edge[] = graphData.edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'default',
          animated: edge.label === 'manages',
          style: getEdgeStyle(edge.label),
          labelStyle: { fill: getEdgeStyle(edge.label).stroke, fontWeight: 500 },
          labelBgStyle: { fill: '#ffffff', opacity: 0.8 },
          labelBgPadding: [8, 4],
          labelBgBorderRadius: 4,
        }));
  
        setEdges(formattedEdges);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load resource graph');
        console.error('Error loading resource graph:', err);
      } finally {
        setIsLoading(false);
      }
    };
  
    fetchResourceGraph();
  }, [
    currentContext?.name, // Only trigger on context NAME change, not object reference
    resourceDetails?.namespace,
    resourceDetails?.group,
    resourceDetails?.version,
    resourceDetails?.resourceType,
    resourceDetails?.resourceName,
    setNodes,
    setEdges
  ]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full">Loading resource graph...</div>;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-600">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-transparent relative">

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.5,
          duration: 500
        }}
      >
        
        <Controls style={{ backgroundColor: '#ffffff', color: 'black', borderRadius: '0.5rem' }} />
        {/* <MiniMap /> */}
        <Background color="#ffffffCC" variant={BackgroundVariant.Dots} />
        <ResourceDetailsPanel
          resource={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      </ReactFlow>

    </div>
  );
};

export default ResourceCanvas;