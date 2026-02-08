import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight, ArrowUpRight, Server } from "lucide-react";
import { getPods, getNodes } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1Pod, V1Node } from '@kubernetes/client-node';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface PodsMetricCardProps {
  // Optional props that can override the API data (for testing)
  runningOverride?: number;
  capacityOverride?: number;
}

const PodsMetricCard: React.FC<PodsMetricCardProps> = ({ 
  runningOverride,
  capacityOverride
}) => {
  const { currentContext } = useCluster();
  const [pods, setPods] = useState<V1Pod[]>([]);
  const [nodes, setNodes] = useState<V1Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const fetchData = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Fetch all pods across all namespaces
        const podsData = await getPods(currentContext.name);
        setPods(podsData);

        // Fetch nodes to calculate capacity
        const nodesData = await getNodes(currentContext.name);
        setNodes(nodesData);
      } catch (err) {
        console.error('Failed to fetch pods or nodes:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [currentContext]);

  // Calculate running pods
  const runningPods = runningOverride !== undefined ? 
    runningOverride : 
    pods.filter(pod => pod.status?.phase === 'Running').length;

  // Calculate total pods (all states)
  const totalPods = capacityOverride !== undefined ? 
    capacityOverride : 
    pods.length;
  
  // Calculate percentage for progress bar
  const percentage = totalPods > 0 ? Math.min(100, Math.round((runningPods / totalPods) * 100)) : 0;
  
  return (
    <Card className="bg-white dark:bg-transparent border-gray-200/50 border dark:border-gray-600/30 h-full flex flex-col">
      <CardContent className="p-5 flex flex-col flex-1">
        <div className="flex justify-between">
          <h3 className="text-sm uppercase text-gray-700 dark:text-gray-400">Pods</h3>
          <div className="p-1 rounded-full bg-green-500/20">
            <Server className="h-5 w-5 text-green-500 dark:text-green-400" />
          </div>
        </div>
        <div className="mt-4">
          {loading ? (
            <div className="text-3xl font-bold text-gray-900 dark:text-white animate-pulse">...</div>
          ) : (
            <div className=" font-light text-gray-900 dark:text-white"><span className='text-4xl'>{runningPods}</span>  <span className='dark:text-gray-500 text-lg'>/{totalPods}</span></div>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Running / Total Pods</div>
        </div>
        <div className="mt-4 h-4 bg-gray-200 dark:bg-gray-800 rounded-[0.2rem]">
          <div 
            className="h-4 bg-green-600 dark:bg-green-500 rounded-[0.2rem]" 
            style={{ width: loading ? '0%' : `${percentage}%` }}
          ></div>
        </div>
        {error && (
          <div className="text-xs text-red-500 mt-2">Error loading pod data</div>
        )}
        <div className="flex-1"></div>
        <Button variant="outline" size="sm" className="w-full flex justify-between" onClick={() => navigate('/dashboard/explore/pods')}>View Pods <ArrowUpRight className="w-4 h-4" /></Button> 
      </CardContent>
    </Card>
  );
};

export default PodsMetricCard;