import React, { useState } from 'react';
import { GitCompareArrows } from 'lucide-react';
import DriftAnalysis from './driftanalysis.component';

const DriftAnalysisContainer: React.FC = () => {
  const [isDriftAnalysisOpen, setIsDriftAnalysisOpen] = useState(false);

  const toggleDriftAnalysis = () => {
    setIsDriftAnalysisOpen(!isDriftAnalysisOpen);
  };

  return (
    <>
      <button
        className="py-1 backdrop-blur-md flex items-center px-4 text-foreground hover:bg-accent-hover space-x-1"
        onClick={toggleDriftAnalysis}
      >
        <GitCompareArrows className='h-3 w-3' />
        <span>Drift Analysis</span>
      </button>

      <DriftAnalysis
        isOpen={isDriftAnalysisOpen}
        onClose={() => setIsDriftAnalysisOpen(false)}
      />
    </>
  );
};

export default DriftAnalysisContainer;
