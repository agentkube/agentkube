import React, { useState, useCallback } from 'react';
import {
  ReactFlow,
  // MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  NodeTypes,
  Handle,
  Position,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Boxes, Globe, Split, Waypoints, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ResourceData {
  label: string;
  type: string;
  details?: {
    namespace?: string;
    replicas?: number;
    image?: string;
    resources?: {
      requests?: { cpu?: string; memory?: string };
      limits?: { cpu?: string; memory?: string };
    };
    volumes?: string[];
  };
}



interface ResourceNodeProps {
  data: ResourceData;
  isConnectable: boolean;
}

interface InternetNodeProps {
  data: {
    label: string;
  };
  isConnectable: boolean;
}

const ResourceDetailsPanel = ({ resource, onClose }: { resource: ResourceData | null; onClose: () => void }) => {
  return (
    <AnimatePresence>
      {resource && (
        <Panel position="bottom-right">
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-80 bg-gray-100 rounded-xl shadow-xl border-l border-gray-200 overflow-y-auto"
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 font-[Anton] uppercase">{resource.type}</h2>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-x-2">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Name</h3>
                    <p className="mt-1 text-base text-gray-900">{resource.label}</p>
                  </div>

                  {resource.details?.namespace && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Namespace</h3>
                      <p className="mt-1 text-base text-gray-900 border border-gray-500 w-fit py-0.5 px-2 bg-gray-50 rounded-[0.5rem]">
                        {resource.details.namespace}
                      </p>
                    </div>
                  )}
                </div>

                {resource.details?.replicas !== undefined && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Replicas</h3>
                    <p className="mt-1 text-base text-gray-900">{resource.details.replicas}</p>
                  </div>
                )}

                {resource.details?.image && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Image</h3>
                    <p className="mt-1 text-base text-gray-900 break-all w-fit bg-gray-200 py-0.5 px-2 border border-gray-500 rounded-[0.4rem]">
                      {resource.details.image}
                    </p>
                  </div>
                )}

                {resource.details?.resources && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Resources</h3>
                    <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-x-2 border border-gray-300">
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700">Requests</h4>
                        <div className="mt-1 text-sm text-gray-600">
                          <p>CPU: {resource.details.resources.requests?.cpu || 'N/A'}</p>
                          <p>Memory: {resource.details.resources.requests?.memory || 'N/A'}</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Limits</h4>
                        <div className="mt-1 text-sm text-gray-600">
                          <p>CPU: {resource.details.resources.limits?.cpu || 'N/A'}</p>
                          <p>Memory: {resource.details.resources.limits?.memory || 'N/A'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {resource.details?.volumes && resource.details.volumes.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Volumes</h3>
                    <ul className="mt-1 space-y-1">
                      {resource.details.volumes.map((volume, index) => (
                        <li key={index} className="text-base text-gray-900">
                          {volume}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </Panel>
      )}
    </AnimatePresence>
  );
};

const ResourceNode = ({ data, isConnectable }: ResourceNodeProps) => {
  const getIcon = () => {
    switch (data.type) {
      case 'Pod':
        return <Box className="w-8 h-8 text-blue-600" />;
      case 'Deployment':
      case 'ReplicaSet':
        return <Boxes className="w-8 h-8 text-blue-600" />;
      case 'Service':
        return <Waypoints className="w-8 h-8 text-blue-600" />;
      case 'Ingress':
        return <Split className="w-8 h-8 text-blue-600" />;
      default:
        return null;
    }
  };
  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
      <div className="flex items-center space-x-4 bg-white rounded-lg border border-gray-300 shadow-md px-4 py-2 min-w-[120px]">
        {getIcon()}
        <div>
          <div className="text-xs text-gray-500">{data.type}</div>
          <div className="text-sm font-medium">{data.label}</div>
        </div>
      </div>
      {data.type !== 'Pod' && (
        <Handle
          type="source"
          position={Position.Right}
          isConnectable={isConnectable}
          className="w-3 h-3 bg-blue-500"
        />
      )}
    </div>
  );
};

const InternetNode = ({ data, isConnectable }: InternetNodeProps) => {
  return (
    <div className="relative">
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-blue-200 px-4 py-2">
        <div className="w-10 h-10 bg-blue-300 rounded-full">
          <Globe className='w-10 h-10 text-blue-800' />
        </div>
        <p className="text-md font-medium text-center text-gray-600">{data.label}</p>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="w-3 h-3 bg-blue-500"
      />
    </div>
  );
};

const nodeTypes: NodeTypes = {
  resource: ResourceNode,
  internet: InternetNode,
};

const TestCanvas = () => {
  const initialNodes: Node[] = [
    {
      id: 'internet',
      type: 'internet',
      position: { x: 100, y: 200 },
      data: { label: 'Internet', type: "Internet" }
    },
    {
      id: 'ingress',
      type: 'resource',
      position: { x: 300, y: 200 },
      data: {
        label: 'nginx-ingress',
        type: 'Ingress',
        details: {
          // namespace: 'ingress-nginx',
          // image: 'nginx-ingress-controller:v1.8.0'
        }
      }
    },
    {
      id: 'service',
      type: 'resource',
      position: { x: 500, y: 200 },
      data: {
        label: 'nginx-svc',
        type: 'Service',
        details: {
          namespace: 'default'
        }
      }
    },
    {
      id: 'deployment',
      type: 'resource',
      position: { x: 700, y: 200 },
      data: {
        label: 'nginx-depl',
        type: 'Deployment',
        details: {
          namespace: 'default',
          replicas: 2,
          image: 'nginx:1.24.0',
          resources: {
            requests: {
              cpu: '100m',
              memory: '128Mi'
            },
            limits: {
              cpu: '200m',
              memory: '256Mi'
            }
          }
        }
      }
    },
    {
      id: 'replicaset',
      type: 'resource',
      position: { x: 900, y: 200 },
      data: {
        label: 'nginx-rs-1',
        type: 'ReplicaSet',
        details: {
          namespace: 'default',
          replicas: 2
        }
      }
    },
    {
      id: 'pod1',
      type: 'resource',
      position: { x: 1100, y: 100 },
      data: {
        label: 'nginx-pod-0',
        type: 'Pod',
        details: {
          namespace: 'default',
          image: 'nginx:1.24.0',
          resources: {
            requests: {
              cpu: '100m',
              memory: '128Mi'
            },
            limits: {
              cpu: '200m',
              memory: '256Mi'
            }
          },
          volumes: ['nginx-config', 'nginx-data']
        }
      }
    },
    {
      id: 'pod2',
      type: 'resource',
      position: { x: 1100, y: 300 },
      data: {
        label: 'nginx-pod-1',
        type: 'Pod',
        details: {
          namespace: 'default',
          image: 'nginx:1.24.0',
          resources: {
            requests: {
              cpu: '100m',
              memory: '128Mi'
            },
            limits: {
              cpu: '200m',
              memory: '256Mi'
            }
          },
          volumes: ['nginx-config', 'nginx-data']
        }
      }
    }
  ];
  const deploymentNode = initialNodes.find(node => node.id === 'deployment');
  const deploymentData = deploymentNode ? {
    label: deploymentNode.data.label as string,
    type: deploymentNode.data.type as string,
    details: deploymentNode.data.details as ResourceData['details']
  } : null;

  const [selectedNode, setSelectedNode] = useState<ResourceData | null>(deploymentData);


  const initialEdges: Edge[] = [
    {
      id: 'e5',
      source: 'internet',
      target: 'ingress',
      animated: true,
      style: { stroke: '#2563eb', strokeWidth: 2 }
    },
    {
      id: 'e4',
      source: 'ingress',
      target: 'service',
      animated: true,
      style: { stroke: '#2563eb', strokeWidth: 2 }
    },
    {
      id: 'e3',
      source: 'service',
      target: 'deployment',
      animated: true,
      style: { stroke: '#2563eb', strokeWidth: 2 }
    },
    {
      id: 'e2',
      source: 'deployment',
      target: 'replicaset',
      animated: true,
      style: { stroke: '#2563eb', strokeWidth: 2 }
    },
    {
      id: 'e1-1',
      source: 'replicaset',
      target: 'pod1',
      animated: true,
      style: { stroke: '#2563eb', strokeWidth: 2 }
    },
    {
      id: 'e1-2',
      source: 'replicaset',
      target: 'pod2',
      animated: true,
      style: { stroke: '#2563eb', strokeWidth: 2 }
    }
  ];

  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => addEdge({
        ...params,
        animated: true,
        style: { stroke: '#2563eb', strokeWidth: 2 }
      }, eds));
    },
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node.data as any);
  }, []);


  return (
    <div className="w-full h-[550px] border border-gray-500 rounded-xl bg-gray-300/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.5 }}
      >
        <Background color="#fffff" variant={BackgroundVariant.Dots} />
        <Controls />
        {/* <MiniMap
          nodeColor={(n: Node) => {
            switch (n.type) {
              case 'internet':
                return '#93c5fd';
              default:
                return '#ffffff';
            }
          }}
          nodeStrokeColor={(n: Node) => {
            switch (n.type) {
              case 'internet':
                return '#2563eb';
              default:
                return '#94a3b8';
            }
          }}
        /> */}
        <ResourceDetailsPanel
          resource={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      </ReactFlow>
    </div>
  );
};

export default TestCanvas;