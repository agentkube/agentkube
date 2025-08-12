import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { ArrowUpRight, Cpu } from "lucide-react";
import { getNamespaces } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { V1Namespace } from '@kubernetes/client-node';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
interface NamespacesMetricCardProps {
  // No longer needed - will use total namespaces from API
}

const NamespacesMetricCard: React.FC<NamespacesMetricCardProps> = () => {
  const { currentContext } = useCluster();
  const [namespaces, setNamespaces] = useState<V1Namespace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const fetchNamespaces = async () => {
      if (!currentContext) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const namespacesData = await getNamespaces(currentContext.name);
        setNamespaces(namespacesData);
      } catch (err) {
        console.error('Failed to fetch namespaces:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch namespaces');
      } finally {
        setLoading(false);
      }
    };
    
    fetchNamespaces();
  }, [currentContext]);

  // Count of active namespaces
  const activeNamespaces = namespaces.filter(ns => 
    ns.status?.phase === 'Active'
  ).length;

  // Total namespaces count
  const totalNamespaces = namespaces.length;

  // For visualization: filled slots represent active namespaces, empty slots are remaining
  const filledSlots = activeNamespaces;
  const emptySlots = totalNamespaces - activeNamespaces;
  
  return (
    <Card className="bg-white dark:bg-transparent border-gray-200/50 border dark:border-gray-600/30 h-full flex flex-col">
      <CardContent className="p-5 flex flex-col flex-1">
        <div className="flex justify-between">
          <h3 className="text-sm uppercase text-gray-700 dark:text-gray-400">Namespaces</h3>
          <div className="p-1 rounded-full bg-blue-500/20">
            <Cpu className="h-5 w-5 text-blue-500 dark:text-blue-400" />
          </div>
        </div>
        <div className="mt-4">
          {loading ? (
            <div className="text-3xl font-bold text-gray-900 dark:text-white animate-pulse">...</div>
          ) : (
            <div className=" font-light text-gray-900 dark:text-white"><span className='text-4xl'>{activeNamespaces}</span>  <span className='dark:text-gray-500 text-lg'>/{totalNamespaces}</span></div>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Active Namespaces</div>
        </div>
        <div className={`mt-4 grid gap-1 max-h-[2rem] overflow-hidden`} style={{ gridTemplateColumns: `repeat(${Math.ceil(totalNamespaces / 2)}, 1fr)` }}>
          {[...Array(filledSlots)].map((_, i) => <div key={i} className="h-3 bg-blue-500 rounded-[0.2rem]"></div>)}
          {[...Array(emptySlots)].map((_, i) => <div key={i + filledSlots} className="h-3 bg-gray-200 dark:bg-gray-700 rounded-[0.2rem]"></div>)}
        </div>
        {error && (
          <div className="text-xs text-red-500 mt-2">Error loading namespaces</div>
        )}
        <div className="flex-1"></div>
        <Button variant="outline" size="sm" className="w-full flex justify-between" onClick={() => navigate('/dashboard/explore/namespaces')}>View Namespaces <ArrowUpRight className="w-4 h-4" /></Button> 
      </CardContent>
    </Card>
  );
};

export default NamespacesMetricCard;