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
import { Loader2 } from 'lucide-react';
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
  attackPath?: boolean;
}

export const ResourceCanvas = ({ resourceDetails, attackPath }: ResourceCanvasProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<K8sResourceData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<K8sResourceData | null>(null);
  const { currentContext } = useCluster();


  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<K8sResourceData>) => {
    // Normalize the data for container and image nodes
    const normalizedData: K8sResourceData = {
      ...node.data,
      resourceType: node.data.resourceType || node.type || 'unknown' // Use node.type as fallback for resourceType
    };
    setSelectedResource(normalizedData);
  }, []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
  }, [setEdges]);

  const calculateNodePositions = (graphData: K8sGraphData): Node<K8sResourceData>[] => {
    const VERTICAL_SPACING = 120;
    const HORIZONTAL_SPACING = 400;

    // Define the logical order/layers for Kubernetes resources
    const resourceOrder = {
      // External/Ingress layer (leftmost)
      'ingresses': 0,
      
      // Service layer (left side)
      'services': 1,
      
      // Main workload layer (center)
      'deployments': 2,
      'statefulsets': 2,
      'daemonsets': 2,
      'jobs': 2,
      'cronjobs': 2,
      
      // Replica management layer
      'replicasets': 3,
      
      // Pod layer (right side)
      'pods': 4,
      
      // Container layer (attack path)
      'container': 5,
      
      // Image layer (attack path)
      'image': 6,
      
      // Config layer (top/bottom to avoid conflicts)
      'configmaps': 1,
      'secrets': 1,
    };

    // Group nodes by their logical layer
    const nodesByLayer = new Map<number, K8sResourceData[]>();
    
    graphData.nodes.forEach(node => {
      const resourceType = node.data.resourceType || node.type; // fallback for attack path nodes
      const layer = resourceOrder[resourceType as keyof typeof resourceOrder] ?? 2; // default to workload layer
      
      if (!nodesByLayer.has(layer)) {
        nodesByLayer.set(layer, []);
      }
      nodesByLayer.get(layer)?.push(node.data);
    });

    // Create positioned nodes
    const positionedNodes: Node<K8sResourceData>[] = [];
    
    nodesByLayer.forEach((nodes, layer) => {
      nodes.forEach((nodeData, index) => {
        const node = graphData.nodes.find(n => n.data === nodeData);
        if (node) {
          // Special positioning for config resources (configmaps, secrets)
          let yPosition = index * VERTICAL_SPACING;
          const resourceType = nodeData.resourceType || node.type;
          
          if (resourceType === 'configmaps') {
            yPosition = -150; // Position above the main flow
          } else if (resourceType === 'secrets') {
            yPosition = -50; // Position above the main flow, but below configmaps
          }

          positionedNodes.push({
            id: node.id,
            type: node.type,
            position: {
              x: layer * HORIZONTAL_SPACING,
              y: yPosition
            },
            data: nodeData,
          });
        }
      });
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
          resourceDetails.resourceName,
          attackPath
        );
  
        const positionedNodes = calculateNodePositions(graphData);
        setNodes(positionedNodes);
  
        const formattedEdges: Edge[] = graphData.edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'default',
          animated: edge.label !== 'all-nodes', // true by default, can there is not nodes label as all-nodes
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
    attackPath,
    setNodes,
    setEdges
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center text-gray-500 dark:text-gray-400/50 h-full gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading resource graph...</span>
      </div>
    );
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