"use client"

import * as React from "react"
import { ChartLineDotsColors, ChartBarStacked, ChartBarLabelCustom, ChartNetworkTrafficStep, ChartServiceHealthRadar, ChartStorageUtilizationRadial } from './graphs.component';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"

interface GraphContainerProps {
  isVisible: boolean;
}

const GraphContainer: React.FC<GraphContainerProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  const charts = [
    { component: <ChartLineDotsColors />, key: 'cpu-usage' },
    { component: <ChartBarStacked />, key: 'memory-usage' },
    { component: <ChartBarLabelCustom />, key: 'pod-status' },
    { component: <ChartNetworkTrafficStep />, key: 'network-traffic' },
    { component: <ChartServiceHealthRadar />, key: 'service-health' },
    { component: <ChartStorageUtilizationRadial />, key: 'storage-utilization' },
  ];

  return (
    <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700/30">
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Visualizations
      </div>
      <div className="relative">
        <Carousel className="w-full">
          <CarouselContent className="-ml-10">
            {charts.map((chart, index) => (
              <CarouselItem key={chart.key} className="pl-4 basis-auto">
                {chart.component}
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="absolute left-2 top-1/2 -translate-y-1/2 z-10 backdrop-blur-md" />
          <CarouselNext className="absolute right-2 top-1/2 -translate-y-1/2 z-10 backdrop-blur-md" />
        </Carousel>
      </div>
    </div>
  );
};

export default GraphContainer;