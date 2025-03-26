import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Minus, Plus } from "lucide-react";
import { useCluster } from '@/contexts/clusterContext';
import { Alert, AlertDescription } from "@/components/ui/alert";

export type ResourceType = 'deployment' | 'statefulset' | 'replicaset';

interface Resource {
  metadata?: {
    name?: string;
    namespace?: string;
  };
  spec?: {
    replicas?: number;
  };
}

interface ScaleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onScaleComplete: () => void;
  resources: Resource[];
  resourceType: ResourceType;
}

const ScaleDialog: React.FC<ScaleDialogProps> = ({
  isOpen,
  onClose,
  onScaleComplete,
  resources,
  resourceType,
}) => {
  const { currentContext } = useCluster();
  const [replicas, setReplicas] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Determine the API path based on resource type
  const getApiPath = (type: ResourceType): string => {
    switch (type) {
      case 'deployment':
        return 'apis/apps/v1/namespaces/{{namespace}}/deployments/{{name}}';
      case 'statefulset':
        return 'apis/apps/v1/namespaces/{{namespace}}/statefulsets/{{name}}';
      case 'replicaset':
        return 'apis/apps/v1/namespaces/{{namespace}}/replicasets/{{name}}';
      default:
        return 'apis/apps/v1/namespaces/{{namespace}}/deployments/{{name}}';
    }
  };

  // Pluralized display name
  const getDisplayName = (type: ResourceType): string => {
    switch (type) {
      case 'deployment':
        return 'Deployments';
      case 'statefulset':
        return 'StatefulSets';
      case 'replicaset':
        return 'ReplicaSets';
      default:
        return 'Resources';
    }
  };

  // Initialize replicas value from the selected resources
  useEffect(() => {
    if (resources.length === 1 && resources[0]?.spec?.replicas !== undefined) {
      setReplicas(resources[0].spec.replicas);
    } else {
      // Default to 1 when multiple resources are selected or replicas isn't defined
      setReplicas(1);
    }
  }, [resources, isOpen]);

  const handleScaleResources = async () => {
    if (!currentContext || resources.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const scalePromises = resources.map(async (resource) => {
        if (!resource.metadata?.name || !resource.metadata?.namespace) {
          throw new Error(`Resource is missing name or namespace`);
        }

        const apiPath = getApiPath(resourceType)
          .replace('{{namespace}}', resource.metadata.namespace)
          .replace('{{name}}', resource.metadata.name);

        const response = await fetch(`/operator/clusters/${currentContext.name}/${apiPath}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/strategic-merge-patch+json',
          },
          body: JSON.stringify({
            spec: {
              replicas: replicas
            }
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `Failed to scale ${resource.metadata.name}`);
        }

        return response.json();
      });

      await Promise.all(scalePromises);
      onScaleComplete();
      onClose();
    } catch (err) {
      console.error('Failed to scale resources:', err);
      setError(err instanceof Error ? err.message : 'Failed to scale resources');
    } finally {
      setLoading(false);
    }
  };

  const incrementReplicas = () => {
    setReplicas(prev => prev + 1);
  };

  const decrementReplicas = () => {
    setReplicas(prev => (prev > 0 ? prev - 1 : 0));
  };

  const handleReplicasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 0) {
      setReplicas(value);
    } else if (e.target.value === '') {
      setReplicas(0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-gray-100 dark:bg-[#0B0D13]">
        <DialogHeader>
          <DialogTitle>Scale {getDisplayName(resourceType)}</DialogTitle>
          <DialogDescription>
            {resources.length > 1
              ? `Set replica count for ${resources.length} selected ${getDisplayName(resourceType).toLowerCase()}`
              : `Adjust the number of replicas for ${resources[0]?.metadata?.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="replicas" className="text-sm font-medium">
                Replicas
              </Label>
              <div className="flex items-center mt-1 space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={decrementReplicas}
                  disabled={replicas <= 0 || loading}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="replicas"
                  type="number"
                  value={replicas}
                  onChange={handleReplicasChange}
                  className="h-8 text-center"
                  min={0}
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={incrementReplicas}
                  disabled={loading}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleScaleResources} 
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {loading ? "Scaling..." : "Scale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ScaleDialog;