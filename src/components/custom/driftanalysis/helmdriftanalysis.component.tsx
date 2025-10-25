import React from 'react';
import { Package } from 'lucide-react';

const HelmDriftAnalysis: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400">
      <Package className="h-16 w-16 mb-4 text-gray-500" />
      <p className="text-lg font-medium">Helm Release Drift Analysis</p>
      <p className="text-sm mt-2 text-gray-500">To be implemented</p>
    </div>
  );
};

export default HelmDriftAnalysis;
