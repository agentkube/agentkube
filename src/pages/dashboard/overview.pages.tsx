import React from 'react';
import { Card } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { ArrowRight, Server, AlertCircle, Clock, HardDrive, Cpu, Database } from "lucide-react";
import { ClusterReportCard, EventMetricsCard, NamespacesMetricCard, PodsMetricCard, ResourceUsageChart } from '@/components/custom';
import { CostReport } from '@/components/custom';
import { KUBERNETES } from '@/assets';

const Overview = () => {
  return (
    <div className="p-6 space-y-2
        max-h-[92vh] overflow-y-auto
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

      {/* Top Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Cloud Cost Card */}
        <CostReport />

        {/* Cluster Health Card */}
        <Card className="bg-card/20 border border-gray-200/70 dark:border-gray-700/30 overflow-hidden relative shadow-none">
          <ClusterReportCard />
          <img src={KUBERNETES} className='absolute top-0 right-0 w-64 grayscale-25 dark:grayscale opacity-10 dark:opacity-10 h-64 -z-10 rounded-full -mr-10 -mt-10' />
          {/* <div className="absolute top-0 right-0 w-64 h-64 -z-10 bg-gradient-to-bl from-indigo-200/70 via-pink-200/70 to-orange-200/70 dark:from-indigo-500/10 dark:via-pink-500/20 dark:to-orange-500/10 blur-3xl rounded-full -mr-10 -mt-10"></div> */}
        </Card>

      </div>

      {/* Resource Usage Chart */}
      <ResourceUsageChart />

      {/* Additional Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <PodsMetricCard />
        <NamespacesMetricCard />
        <EventMetricsCard />
      </div>
    </div>
  );
};

export default Overview;