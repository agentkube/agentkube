import React from 'react';
import { Card, CardContent } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { ArrowRight, Server, AlertCircle, Clock, HardDrive, Cpu, Database } from "lucide-react";
import { EventMetricsCard, NamespacesMetricCard, PodsMetricCard, ResourceUsageChart } from '@/components/custom';
import { CostReport } from '@/components/custom';
import { toast } from '@/hooks/use-toast';
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
        
        {/* Cluster Health Card */}
        <Card className="bg-gray-50 dark:bg-gray-800/30 border-gray-200/70 dark:border-gray-700/30 shadow-lg overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-200/70 via-pink-200/70 to-orange-200/70 dark:from-indigo-500/30 dark:via-pink-500/30 dark:to-orange-500/30 blur-3xl rounded-full -mr-10 -mt-10"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 bg-blue-300/70 dark:bg-blue-400/50 rounded-full mb-16 mr-8"></div>
          <div className="absolute top-0 right-0 w-3 h-3 bg-blue-300/70 dark:bg-blue-400/50 rounded-full mt-8 mr-32"></div>
          
          <CardContent className="p-6 relative z-10">
            <div className="space-y-3">
              <h2 className="text-4xl font-bold text-gray-900 dark:text-white leading-tight">
                Cluster<br />Health
              </h2>
              
              <p className="text-gray-500 dark:text-gray-400">
                {/* 2 pending alerts require attention */}
                .
              </p>
              
              <div className="pt-20">
                <Button 
                onClick={() => {
                  toast({
                    title: "Feature Not Implemented",
                    description: "The Cluster Health feature is part of our roadmap and will be available soon.",
                  })
                }}
                variant="outline" className="">
                  View Health <ArrowRight />
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