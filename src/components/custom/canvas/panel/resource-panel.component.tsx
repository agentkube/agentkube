import React from 'react';
import { Panel } from '@xyflow/react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { K8sResourceData } from '@/utils/kubernetes-graph.utils';
import { KubeResourceIconMap, KubeResourceType } from '@/constants/kuberesource-icon-map.constant';

interface ResourceDetailsPanelProps {
  resource: K8sResourceData | null;
  onClose: () => void;
}

// Define types for container status to fix implicit any errors
interface ContainerState {
  running?: { startedAt: string };
  terminated?: {
    containerID: string;
    exitCode: number;
    finishedAt: string;
    reason: string;
    startedAt: string;
  };
  waiting?: { reason: string; message: string };
}

interface ContainerStatus {
  containerID: string;
  image: string;
  imageID: string;
  name: string;
  ready: boolean;
  restartCount: number;
  started: boolean;
  state: ContainerState;
  lastState?: ContainerState;
}

export const ResourceDetailsPanel = ({ resource, onClose }: ResourceDetailsPanelProps) => {
  const [copied, setCopied] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);

  if (!resource) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resource.resourceName);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };


  // Helper to render resource conditions with appropriate styling
  const renderConditions = (conditions: any[]) => {
    if (!conditions || conditions.length === 0) return null;

    return (
      <div className="mt-3">
        <h4 className="text-xs font-medium text-gray-500 mb-1">Conditions</h4>
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={index} className="p-2 bg-gray-50 rounded-[0.3rem] border border-gray-400 ">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{condition.type}</span>
                <span className={`text-xs px-2 py-0.5 rounded-[0.3rem] ${condition.status === 'True'
                  ? 'bg-emerald-200 text-green-800 border border-green-800'
                  : 'bg-red-100 text-red-800'
                  }`}>
                  {condition.status}
                </span>
              </div>
              {condition.reason && (
                <div className="text-xs mt-1 text-gray-600">
                  Reason: {condition.reason}
                </div>
              )}
              {condition.message && (
                <div className="text-xs mt-0.5 text-gray-600 line-clamp-2" title={condition.message}>
                  {condition.message}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Content based on resource type
  const renderResourceSpecificDetails = () => {
    const status = resource.status as Record<string, any>;
    const replicas = status?.replicas as Record<string, any> | undefined;

    switch (resource.resourceType) {
      case 'pods': {
        const podPhase = replicas?.phase as string | undefined;
        const podIP = replicas?.podIP as string | undefined;
        const containerStatuses = replicas?.containerStatuses as ContainerStatus[] | undefined;

        return (
          <div className="border-t border-gray-200 ">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Pod Details</h3>

            {/* Phase/Status */}
            <div className='grid grid-cols-2 gap-x-2'>
              {podPhase && (
                <div className="mb-2">
                  <h4 className="text-xs font-medium text-gray-500">Status</h4>
                  <span
                    className={`inline-block mt-1 px-2 py-1 rounded-[0.3rem] text-xs ${podPhase === 'Running'
                      ? 'bg-emerald-200 text-green-800 border border-green-800'
                      : podPhase === 'Pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                      }`}
                  >
                    {podPhase}
                  </span>
                </div>
              )}

              {/* Pod IP */}
              {podIP && (
                <div className="mb-2">
                  <h4 className="text-xs font-medium text-gray-500">Pod IP</h4>
                  <p className="mt-1 text-sm text-gray-900 border px-2 py-0.5 border-gray-500 w-fit bg-gray-200 rounded-[0.3rem]">{podIP}</p>
                </div>
              )}
            </div>

            {/* Container Information */}
            {containerStatuses && containerStatuses.length > 0 && (
              <div className="mt-3">
                <h4 className="text-xs font-medium text-gray-500 mb-1">Containers</h4>
                {containerStatuses.map((container, index) => (
                  <div key={index} className="mt-2 p-2 bg-gray-50 rounded-[0.3rem] border border-gray-400">
                    <p className="text-sm font-medium">{container.name}</p>
                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                      <div>
                        <span className="text-gray-500">Image:</span>
                        <p className="truncate text-gray-700" title={container.image}>
                          {container.image.split(':')[0].split('/').pop()}:{container.image.split(':')[1] || 'latest'}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">State:</span>
                        <span>
                          {container.state.running ? 'Running' :
                            container.state.terminated ? 'Terminated' : 'Waiting'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }

      case 'deployments': {
        // Extract deployment-specific data
        const availableReplicas = replicas?.availableReplicas;
        const readyReplicas = replicas?.readyReplicas;
        const totalReplicas = replicas?.replicas;
        const updatedReplicas = replicas?.updatedReplicas;

        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Deployment Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500">Available</h4>
                <p className="text-sm mt-1">
                  <span className={availableReplicas > 0 ? "text-green-600 font-medium" : "text-gray-600"}>
                    {availableReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Ready</h4>
                <p className="text-sm mt-1">
                  <span className={readyReplicas > 0 ? "text-green-600 font-medium" : "text-gray-600"}>
                    {readyReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Updated</h4>
                <p className="text-sm mt-1">
                  <span className={updatedReplicas > 0 ? "text-blue-600 font-medium" : "text-gray-600"}>
                    {updatedReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }

      case 'replicasets': {
        // Extract replicaset-specific data
        const availableReplicas = replicas?.availableReplicas;
        const fullyLabeledReplicas = replicas?.fullyLabeledReplicas;
        const totalReplicas = replicas?.replicas;
        const readyReplicas = replicas?.readyReplicas;

        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">ReplicaSet Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500">Total</h4>
                <p className="text-sm mt-1 text-gray-600 font-medium">
                  {totalReplicas || 0}
                </p>
              </div>
              {availableReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Available</h4>
                  <p className="text-sm mt-1">
                    <span className={availableReplicas > 0 ? "text-green-600 font-medium" : "text-gray-600"}>
                      {availableReplicas}
                    </span>
                  </p>
                </div>
              )}
              {readyReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Ready</h4>
                  <p className="text-sm mt-1">
                    <span className={readyReplicas > 0 ? "text-green-600 font-medium" : "text-gray-600"}>
                      {readyReplicas}
                    </span>
                  </p>
                </div>
              )}
              {fullyLabeledReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Fully Labeled</h4>
                  <p className="text-sm mt-1 text-gray-600">
                    {fullyLabeledReplicas}
                  </p>
                </div>
              )}
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'services': {
        // Extract service-specific data
        const loadBalancer = replicas?.loadBalancer as Record<string, any> | undefined;
        const clusterIP = replicas?.clusterIP;
        const type = replicas?.type;
        const ports = replicas?.ports as any[] | undefined;

        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Service Details</h3>

            {type && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500">Type</h4>
                <p className="text-sm mt-1 text-gray-900">{type}</p>
              </div>
            )}

            {clusterIP && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500">Cluster IP</h4>
                <p className="text-sm mt-1 text-gray-900">{clusterIP}</p>
              </div>
            )}

            {loadBalancer && loadBalancer.ingress && loadBalancer.ingress.length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500">LoadBalancer</h4>
                {loadBalancer.ingress.map((ing: any, idx: number) => (
                  <p key={idx} className="text-sm mt-1 text-gray-900">
                    {ing.ip || ing.hostname}
                  </p>
                ))}
              </div>
            )}

            {ports && ports.length > 0 && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 mb-1">Ports</h4>
                <div className="space-y-1">
                  {ports.map((port, idx) => (
                    <div key={idx} className="text-xs">
                      <span className="text-gray-800">{port.port}</span>
                      {port.targetPort && (
                        <span className="text-gray-600"> → {port.targetPort}</span>
                      )}
                      {port.protocol && (
                        <span className="text-gray-500"> ({port.protocol})</span>
                      )}
                      {port.name && (
                        <span className="text-gray-500 ml-1">{port.name}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'endpoints': {
        const subsets = replicas?.subsets as any[] | undefined;

        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Endpoints Details</h3>

            {subsets && subsets.length > 0 ? (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500 mb-1">Addresses</h4>
                {subsets.map((subset, subsetIdx) => (
                  <div key={subsetIdx} className="mb-2">
                    {subset.addresses && subset.addresses.length > 0 ? (
                      <div className="space-y-1">
                        {subset.addresses.map((addr: any, addrIdx: number) => (
                          <p key={addrIdx} className="text-sm text-green-700">
                            {addr.ip}{addr.targetRef?.name ? ` (${addr.targetRef.name})` : ''}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No ready addresses</p>
                    )}

                    {subset.notReadyAddresses && subset.notReadyAddresses.length > 0 && (
                      <div className="mt-1">
                        <h5 className="text-xs font-medium text-gray-500">Not Ready</h5>
                        <div className="space-y-1 mt-1">
                          {subset.notReadyAddresses.map((addr: any, addrIdx: number) => (
                            <p key={addrIdx} className="text-sm text-red-600">
                              {addr.ip}{addr.targetRef?.name ? ` (${addr.targetRef.name})` : ''}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No endpoints found</p>
            )}
          </div>
        );
      }

      case 'networkpolicies': {
        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Network Policy Details</h3>

            <p className="text-sm text-gray-600">
              Network policies define how pods communicate with each other and other network endpoints.
            </p>
          </div>
        );
      }
      case 'daemonsets': {
        // Extract daemonset-specific data
        const currentNumberScheduled = replicas?.currentNumberScheduled;
        const desiredNumberScheduled = replicas?.desiredNumberScheduled;
        const numberAvailable = replicas?.numberAvailable;
        const numberMisscheduled = replicas?.numberMisscheduled;
        const numberReady = replicas?.numberReady;
        const updatedNumberScheduled = replicas?.updatedNumberScheduled;

        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">DaemonSet Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500">Desired</h4>
                <p className="text-sm mt-1 text-gray-600 font-medium">
                  {desiredNumberScheduled || 0}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Current</h4>
                <p className="text-sm mt-1">
                  <span className={currentNumberScheduled === desiredNumberScheduled ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                    {currentNumberScheduled || 0}
                  </span>
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Ready</h4>
                <p className="text-sm mt-1">
                  <span className={numberReady === desiredNumberScheduled ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                    {numberReady || 0}
                  </span>
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Available</h4>
                <p className="text-sm mt-1">
                  <span className={numberAvailable === desiredNumberScheduled ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                    {numberAvailable || 0}
                  </span>
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Updated</h4>
                <p className="text-sm mt-1">
                  <span className={updatedNumberScheduled === desiredNumberScheduled ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                    {updatedNumberScheduled || 0}
                  </span>
                </p>
              </div>
              {numberMisscheduled !== undefined && numberMisscheduled > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Misscheduled</h4>
                  <p className="text-sm mt-1 text-red-600 font-medium">
                    {numberMisscheduled}
                  </p>
                </div>
              )}
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }

      case 'statefulsets': {
        // Extract statefulset-specific data
        const replicas = status?.replicas as Record<string, any> | undefined;
        const availableReplicas = replicas?.availableReplicas;
        const readyReplicas = replicas?.readyReplicas;
        const totalReplicas = replicas?.replicas;
        const updatedReplicas = replicas?.updatedReplicas;
        const currentRevision = replicas?.currentRevision;
        const updateRevision = replicas?.updateRevision;
        const currentReplicas = replicas?.currentReplicas;

        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">StatefulSet Details</h3>

            {/* Replicas Information */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <h4 className="text-xs font-medium text-gray-500">Total</h4>
                <p className="text-sm mt-1 text-gray-600 font-medium">
                  {totalReplicas || 0}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Available</h4>
                <p className="text-sm mt-1">
                  <span className={availableReplicas === totalReplicas ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                    {availableReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Ready</h4>
                <p className="text-sm mt-1">
                  <span className={readyReplicas === totalReplicas ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                    {readyReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              <div>
                <h4 className="text-xs font-medium text-gray-500">Updated</h4>
                <p className="text-sm mt-1">
                  <span className={updatedReplicas === totalReplicas ? "text-green-600 font-medium" : "text-orange-600 font-medium"}>
                    {updatedReplicas || 0}
                  </span>
                  {totalReplicas ? ` / ${totalReplicas}` : ''}
                </p>
              </div>
              {currentReplicas !== undefined && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Current</h4>
                  <p className="text-sm mt-1 text-gray-600">
                    {currentReplicas}
                  </p>
                </div>
              )}
              {replicas?.observedGeneration && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500">Generation</h4>
                  <p className="text-sm mt-1 text-gray-600">
                    {replicas.observedGeneration}
                  </p>
                </div>
              )}
            </div>

            {/* Revision information */}
            {(currentRevision || updateRevision) && (
              <div className="mt-3 mb-3">
                <h4 className="text-xs font-medium text-gray-500 mb-1">Revisions</h4>
                <div className="space-y-1">
                  {currentRevision && (
                    <div className="text-xs">
                      <span className="text-gray-500">Current:</span>
                      <span className="text-gray-800 ml-1 font-mono text-xs">{currentRevision}</span>
                    </div>
                  )}
                  {updateRevision && (
                    <div className="text-xs">
                      <span className="text-gray-500">Update:</span>
                      <span className="text-gray-800 ml-1 font-mono text-xs">{updateRevision}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Render conditions */}
            {renderConditions(status?.conditions)}
          </div>
        );
      }
      // Add more cases as needed for other resource types

      default: {
        // Default case for other resource types
        return (
          <div className="border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Details</h3>

            {status?.age && (
              <div className="mb-2">
                <h4 className="text-xs font-medium text-gray-500">Age</h4>
                <p className="text-sm mt-1 text-gray-900">{status.age}</p>
              </div>
            )}

            {renderConditions(status?.conditions)}
          </div>
        );
      }
    }
  };

  const iconKey = resource.resourceType.toLowerCase() as KubeResourceType;
  const icon = KubeResourceIconMap[iconKey] || KubeResourceIconMap.default;


  const renderLabels = () => {
    if (!resource.labels || Object.keys(resource.labels).length === 0) return null;
    
    const labelEntries = Object.entries(resource.labels);
    const labelCount = labelEntries.length;
    
    // Display only first 3 labels when collapsed
    const displayedLabels = showAllLabels ? labelEntries : labelEntries.slice(0, 2);
    const hasMoreLabels = labelCount > 2;
    
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-gray-500">Labels</h3>
          {hasMoreLabels && (
            <button 
              onClick={() => setShowAllLabels(!showAllLabels)}
              className="flex items-center text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              {showAllLabels ? (
                <>
                  <span>Show less</span>
                  <ChevronDown size={14} className="ml-1" />
                </>
              ) : (
                <>
                  <span>Show all ({labelCount})</span>
                  <ChevronRight size={14} className="ml-1" />
                </>
              )}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {displayedLabels.map(([key, value]) => (
            <div
              key={key}
              className="text-xs px-2 py-1 bg-blue-100 text-blue-800 border border-blue-800 rounded-[0.3rem]"
            >
              {key}: {value}
            </div>
          ))}
        </div>
      </div>
    );
  };


  return (
    <AnimatePresence>
      {resource && (
        <Panel position="top-right">
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-80 bg-gray-100 rounded-xl shadow-xl border-l border-gray-200 text-gray-600 overflow-y-auto max-h-[calc(100vh-4rem)]"
          >
            <div className="p-4">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 font-[Anton] uppercase flex items-center gap-2">
                  <div className="flex-shrink-0">
                    <img src={icon} alt={resource.resourceType} className="w-6 h-6" />
                  </div>
                  {resource.resourceType}
                  <button
                    onClick={handleCopy}
                    className="text-gray-500 hover:text-gray-700 focus:outline-none ml-2"
                    title="Copy resource name"
                  >
                    {copied ? <Check size={16} className="text-green-500" /> : <Copy size={14} />}
                  </button>
                </h2>
                <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-x-2">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Name</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-base text-gray-900 break-words">{resource.resourceName}</p>
                    </div>
                  </div>

                  <div>
                    {resource.namespace && (
                      <>
                        <h3 className="text-sm font-medium text-gray-500">Namespace</h3>
                        <p className="mt-1 text-base text-gray-900 border border-gray-500 w-fit py-0.5 px-2 bg-gray-50 rounded-[0.5rem]">
                          {resource.namespace}
                        </p>
                      </>
                    )}
                  </div>
                </div>


                {/* Resource-specific details based on type */}
                {renderResourceSpecificDetails()}

                {/* Labels */}
                {renderLabels()}
              </div>
            </div>
          </motion.div>
        </Panel>
      )}
    </AnimatePresence>
  );
};