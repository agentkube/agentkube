import React, { useEffect, useState } from 'react';
import opencostNamespaceData from '@/constants/opencost/opencost-ns.json';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Database, HardDrive, Gauge } from "lucide-react";

interface ResourceCost {
  cpu: number;
  memory: number;
  storage: number;
  network?: number;
  gpu?: number;
  total: number;
}

interface NamespaceCost {
  name: string;
  cost: number;
  percentage: number;
  efficiency: number;
  resources: ResourceCost;
}

// Transform OpenCost namespace data to the format expected by the component
const transformOpenCostData = () => {
  if (!opencostNamespaceData?.data?.[6]) {
    return [];
  }

  const nsData = opencostNamespaceData.data[6];
  
  // Calculate total cost across all namespaces (excluding __idle__ and __unallocated__)
  let totalCost = 0;
  Object.entries(nsData).forEach(([name, data]) => {
    if (name !== '__idle__' && name !== '__unallocated__') {
      totalCost += data.totalCost || 0;
    }
  });
  
  // Transform each namespace entry to the expected format
  const namespaces = Object.entries(nsData)
    .filter(([name, _]) => name !== '__idle__' && name !== '__unallocated__')
    .map(([name, data]) => {
      const cost = data.totalCost || 0;
      const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0;
      
      // Extract efficiency metric - convert to percentage and ensure it's within 0-100 range
      const efficiency = data.totalEfficiency != null ? 
        Math.min(Math.max(data.totalEfficiency * 100, 0), 100) : 0;
      
      return {
        name: name,
        cost: cost,
        percentage: percentage,
        efficiency: efficiency,
        resources: {
          cpu: data.cpuCost || 0,
          memory: data.ramCost || 0, 
          storage: data.pvCost || 0,
          total: cost
        }
      };
    })
    .sort((a, b) => b.cost - a.cost); // Sort by cost (highest first)
  
  return namespaces;
};

const NamespaceCostDistribution: React.FC = () => {
  const [namespaces, setNamespaces] = useState<NamespaceCost[]>([]);

  useEffect(() => {
    // Transform the data when component mounts
    const transformedData = transformOpenCostData();
    setNamespaces(transformedData);
  }, []);

  // Calculate color based on percentage for bars
  const getPercentageColor = (percentage: number): string => {
    if (percentage < 20) return "bg-green-500";
    if (percentage < 50) return "bg-blue-500";
    if (percentage < 80) return "bg-amber-500";
    return "bg-red-500";
  };

  // Calculate color for efficiency 
  const getEfficiencyColor = (efficiency: number): string => {
    if (efficiency < 20) return "text-red-500";
    if (efficiency < 50) return "text-amber-500";
    if (efficiency < 80) return "text-blue-500";
    return "text-green-500";
  };

  return (
    <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Namespace Cost Distribution</h2>
        
        <div className="space-y-5">
          {namespaces.map((ns, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${getPercentageColor(ns.percentage)} mr-2 opacity-80`}></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ns.name}</span>
                  </div>
                  {ns.efficiency > 0 && (
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 ml-5">
                      <Gauge className={`h-3 w-3 ${getEfficiencyColor(ns.efficiency)} mr-1`} />
                      <span className={`${getEfficiencyColor(ns.efficiency)}`}>
                        Efficiency: {ns.efficiency.toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">${ns.cost.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                <div 
                  className={`h-2 ${getPercentageColor(ns.percentage)} rounded-full`}
                  style={{ width: `${ns.percentage}%` }}
                ></div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                  CPU: ${ns.resources.cpu.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Database className="h-3 w-3 text-indigo-500 mr-1" />
                  Memory: ${ns.resources.memory.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                  Storage: ${ns.resources.storage.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default NamespaceCostDistribution;