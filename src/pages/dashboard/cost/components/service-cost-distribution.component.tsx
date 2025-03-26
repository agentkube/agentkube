import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Cpu, Database, HardDrive } from "lucide-react";

interface ResourceCost {
  cpu: number;
  memory: number;
  storage: number;
  network?: number;
  gpu?: number;
  total: number;
}

interface ServiceCost {
  name: string;
  namespace: string;
  cost: number;
  percentage: number;
  resources: ResourceCost;
}

interface ServiceCostDistributionProps {
  services: ServiceCost[];
}

const ServiceCostDistribution: React.FC<ServiceCostDistributionProps> = ({ services }) => {
  // Calculate color based on percentage for bars
  const getPercentageColor = (percentage: number): string => {
    if (percentage < 20) return "bg-green-500";
    if (percentage < 50) return "bg-blue-500";
    if (percentage < 80) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
      <CardContent className="p-6">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Service Cost Distribution</h2>
        
        <div className="space-y-5">
          {services.map((service, idx) => (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full ${getPercentageColor(service.percentage)} mr-2 opacity-80`}></div>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{service.name}</span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 ml-5">Namespace: {service.namespace}</div>
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">${service.cost.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full">
                <div 
                  className={`h-2 ${getPercentageColor(service.percentage)} rounded-full`}
                  style={{ width: `${service.percentage}%` }}
                ></div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Cpu className="h-3 w-3 text-blue-500 mr-1" />
                  CPU: ${service.resources.cpu.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <Database className="h-3 w-3 text-indigo-500 mr-1" />
                  Memory: ${service.resources.memory.toFixed(2)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
                  <HardDrive className="h-3 w-3 text-purple-500 mr-1" />
                  Storage: ${service.resources.storage.toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ServiceCostDistribution;