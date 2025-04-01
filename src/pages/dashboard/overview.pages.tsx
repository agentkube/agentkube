import React from 'react';
import { Card, CardContent } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { ArrowRight, Server, AlertCircle, Clock, HardDrive, Cpu, Database } from "lucide-react";
import { EventMetricsCard, NamespacesMetricCard, PodsMetricCard, ResourceUsageChart } from '@/components/custom';
import { CostReport } from '@/components/custom';
const Overview = () => {
  return (
    <div className="p-6 space-y-6 max-h-[92vh] overflow-y-auto
      scrollbar-thin scrollbar-thumb-gray-400 dark:scrollbar-thumb-gray-700 scrollbar-track-transparent
      [&::-webkit-scrollbar]:w-1.5 
      [&::-webkit-scrollbar-track]:bg-transparent 
      [&::-webkit-scrollbar-thumb]:bg-gray-400/30 dark:[&::-webkit-scrollbar-thumb]:bg-gray-700/30 
      [&::-webkit-scrollbar-thumb]:rounded-full
      [&::-webkit-scrollbar-thumb:hover]:bg-gray-400/50 dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      
      {/* Top Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cloud Cost Card */}
        <CostReport />
        {/* <Card className="bg-white dark:bg-gray-800/20 border-gray-200/50 dark:border-gray-700/30 shadow-lg">
          <CardContent className="p-6">
            <Tabs defaultValue="balance" className="w-full">
              <TabsList className="bg-gray-100 dark:bg-gray-900/30 mb-4">
                <TabsTrigger className='text-gray-700 dark:text-gray-300' value="balance">Cloud Cost</TabsTrigger>
                <TabsTrigger className='text-gray-700 dark:text-gray-300' value="audience">Resources</TabsTrigger>
                <TabsTrigger className='text-gray-700 dark:text-gray-300' value="refunds">Alerts</TabsTrigger>
              </TabsList>
              
              <TabsContent value="balance" className="mt-0">
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Monthly Spend</h2>
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-500 dark:text-green-400 text-xs rounded-full">+35%</span>
                  </div>
                  
                  <div className="text-5xl font-bold text-gray-900 dark:text-white">
                    <span className="text-gray-500 dark:text-gray-400">$</span>480<span className="text-gray-500 dark:text-gray-400">.00</span>
                  </div>
                  
                  <div className="flex items-center gap-2 mt-4">
                    <div className="flex -space-x-2">
                      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                        <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs text-gray-700 dark:text-gray-300">
                          <Server className="h-4 w-4" />
                        </div>
                      ))}
                      <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-400/30 border border-indigo-300 dark:border-indigo-400/50 flex items-center justify-center text-xs text-indigo-700 dark:text-indigo-200">
                        +8
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Running 960 pods across all namespaces.
                  </div>
                  
                  <div className="flex justify-end">
                    <Button className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-white gap-2">
                      Details <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card> */}
        
        {/* Cluster Health Card */}
        <Card className="bg-gray-50 dark:bg-gray-800/30 border-gray-200/70 dark:border-gray-700/30 shadow-lg overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-200/70 via-pink-200/70 to-orange-200/70 dark:from-indigo-500/30 dark:via-pink-500/30 dark:to-orange-500/30 blur-3xl rounded-full -mr-10 -mt-10"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-300/70 dark:bg-blue-400/50 rounded-full mb-16 mr-8"></div>
          <div className="absolute top-0 right-0 w-3 h-3 bg-blue-300/70 dark:bg-blue-400/50 rounded-full mt-8 mr-32"></div>
          
          <CardContent className="p-6 relative z-10">
            <div className="space-y-3">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white leading-tight">
                Cluster<br />Health 98%
              </h2>
              
              <p className="text-gray-500 dark:text-gray-400">
                2 pending alerts require attention
              </p>
              
              <div className="pt-20">
                <Button variant="outline" className="border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:text-gray-900 hover:bg-gray-200/50 dark:hover:text-white dark:hover:bg-gray-700/50">
                  View alerts
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Resource Usage Chart */}
      <ResourceUsageChart /> 

      {/* Additional Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PodsMetricCard /> 
        <NamespacesMetricCard /> 
        <EventMetricsCard /> 
      </div>
    </div>
  );
};

export default Overview;