import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu } from "lucide-react";
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
    <Card className="bg-white dark:bg-transparent border-gray-200/50 dark:border-gray-700/30 shadow-lg">
      <CardContent className="p-6">
        <div className="flex justify-between">
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">Namespaces</h3>
          <div className="p-1 rounded-full bg-blue-500/20">
            <Cpu className="h-5 w-5 text-blue-500 dark:text-blue-400" />
          </div>
        </div>
        <div className="mt-4">
          {loading ? (
            <div className="text-3xl font-bold text-gray-900 dark:text-white animate-pulse">...</div>
          ) : (
            <div className="text-3xl font-bold text-gray-900 dark:text-white">{activeNamespaces} / {totalNamespaces}</div>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">Active Namespaces</div>
        </div>
        <div className="mt-4 grid grid-cols-6 gap-1">
          {/* Active namespaces shown as blue bars */}
          {[...Array(filledSlots)].map((_, i) => (
            <div key={i} className="h-3 bg-blue-500 rounded-[0.2rem]"></div>
          ))}
          {/* Empty slots shown as gray bars */}
          {[...Array(emptySlots)].map((_, i) => (
            <div key={i + filledSlots} className="h-3 bg-gray-200 dark:bg-gray-700 rounded-[0.2rem]"></div>
          ))}
        </div>
        {error && (
          <div className="text-xs text-red-500 mt-2">Error loading namespaces</div>
        )}
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/dashboard/explore/namespaces')}>View Namespaces <ArrowRight className="w-4 h-4" /></Button> 
      </CardContent>
    </Card>
  );
};

export default NamespacesMetricCard;