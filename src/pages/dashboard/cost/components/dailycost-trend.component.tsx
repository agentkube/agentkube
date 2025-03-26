import React, { useState } from 'react';

interface DailyCost {
  date: string;
  cost: number;
}

interface DailyCostTrendProps {
  dailyCostData: DailyCost[];
}

const DailyCostTrend: React.FC<DailyCostTrendProps> = ({ dailyCostData }) => {
  const [activeTooltip, setActiveTooltip] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  // Find maximum cost value for better scaling
  const maxCost = Math.max(...dailyCostData.map(day => day.cost));
  
  // Format date to display in a more readable way
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleMouseEnter = (index: number, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setActiveTooltip(index);
  };

  const handleMouseLeave = () => {
    setActiveTooltip(null);
  };

  return (
    <div className="mt-4 relative">
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Daily Cost Trend</div>
      <div className="h-16 flex items-end gap-1">
        {dailyCostData.map((day, index) => (
          <div
            key={index}
            className="flex-1 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-500 rounded-t cursor-pointer transition-all duration-200 hover:opacity-90"
            style={{
              height: `${(day.cost / maxCost) * 100}%`,
              minHeight: '10%'
            }}
            onMouseEnter={(e) => handleMouseEnter(index, e)}
            onMouseLeave={handleMouseLeave}
          />
        ))}
      </div>
      
      {activeTooltip !== null && (
        <div 
          className="absolute z-10 bg-white dark:bg-[#0F1015]/30 backdrop-blur-sm text-gray-800 dark:text-gray-200 rounded-md shadow-lg p-2 text-xs transform -translate-x-1/2 -translate-y-full pointer-events-none border border-gray-200 dark:border-gray-800"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            position: 'fixed'
          }}
        >
          <div className="font-medium">{formatDate(dailyCostData[activeTooltip].date)}</div>
          <div className="flex items-center justify-between gap-2">
            <span>Cost:</span>
            <span className="font-bold text-blue-600 dark:text-blue-400">
              ${dailyCostData[activeTooltip].cost.toFixed(2)}
            </span>
          </div>
        </div>
      )}
      
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
        <span>{formatDate(dailyCostData[0].date)}</span>
        <span>{formatDate(dailyCostData[dailyCostData.length - 1].date)}</span>
      </div>
    </div>
  );
};

export default DailyCostTrend;