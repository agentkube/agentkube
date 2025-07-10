import React from 'react';
import { 
  ChartLineDotsColors,
  ChartBarStacked,
  ChartBarLabelCustom,
  ChartNetworkTrafficStep,
  ChartServiceHealthRadar,
  ChartStorageUtilizationRadial,
  ChartCryptoPortfolio
} from '@/components/custom/promgraphcontainer/graphs.component';

const DrillDown = () => {
  return (
    <div className="
		      max-h-[93vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className="p-6 mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-5xl dark:text-gray-500/40 font-[Anton] uppercase font-bold">DrillDown</h1>
        </div>
        
        {/* Dashboard Grid Container */}
        <div className="w-full">
          {/* Responsive Grid Layout */}
          <div className="grid gap-1 grid-cols-1 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 auto-rows-auto">
            
            {/* Row 1 - Top Charts */}
            <div className="col-span-1">
              <ChartLineDotsColors />
            </div>
            
            <div className="col-span-1">
              <ChartBarStacked />
            </div>
            
            <div className="col-span-1">
              <ChartBarLabelCustom />
            </div>
            
            {/* Row 2 - Middle Charts */}
            <div className="col-span-1">
              <ChartNetworkTrafficStep />
            </div>
            
            <div className="col-span-1">
              <ChartServiceHealthRadar />
            </div>
            
            <div className="col-span-1">
              <ChartStorageUtilizationRadial />
            </div>
            
            {/* Row 3 - Bottom Chart */}
            {/* <div className="col-span-1">
              <ChartCryptoPortfolio />
            </div> */}
            
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrillDown;