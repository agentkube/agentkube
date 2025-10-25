import React, { useState, useEffect, useRef } from 'react';
import { GitCompareArrows, X } from 'lucide-react';
import HelmDriftAnalysis from './helmdriftanalysis.component';
import ServiceDriftAnalysis from './servicedriftanalysis.component';
import { useDriftAnalysis } from '@/contexts/useDriftAnalysis';

interface DriftAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'services' | 'helm';

const DriftAnalysis: React.FC<DriftAnalysisProps> = ({ isOpen, onClose }) => {
  const { isOpen: isContextOpen, closeDriftAnalysis } = useDriftAnalysis();
  const [activeTab, setActiveTab] = useState<TabType>('services');
  const [panelHeight, setPanelHeight] = useState('90vh');
  const [isDragging, setIsDragging] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  // Use context isOpen state if provided
  const actualIsOpen = isContextOpen || isOpen;

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    const handleResize = (e: MouseEvent) => {
      if (isDragging) {
        const viewportHeight = window.innerHeight;
        const mouseY = e.clientY;

        // Calculate panel height as distance from bottom of screen to mouse
        // with a minimum height of 20vh and max of 80vh
        const heightFromBottom = viewportHeight - mouseY;
        const heightPercentage = Math.min(Math.max((heightFromBottom / viewportHeight) * 100, 20), 90);

        setPanelHeight(`${heightPercentage}vh`);
      }
    };

    const handleResizeEnd = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = '';
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleResizeEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [isDragging]);

  const handleClose = () => {
    closeDriftAnalysis();
    onClose();
  };

  if (!actualIsOpen) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-black/50 backdrop-blur-xl z-50"
      style={{ height: panelHeight }}
    >
      {/* Resize handle at the top */}
      <div
        className="absolute top-0 left-0 right-0 h-1 bg-transparent cursor-ns-resize z-10"
        onMouseDown={handleResizeStart}
      />

      {/* Header */}
      <div ref={headerRef} className="flex justify-between items-center p-2 bg-gray-700/10 border-b border-gray-600/20">
        <div className="flex items-center space-x-2">
          <GitCompareArrows className="h-4 w-4 text-gray-300" />
          <span className="text-gray-300 text-sm font-medium">Drift Analysis</span>
        </div>
        <button
          onClick={handleClose}
          className="text-gray-300 hover:text-white hover:bg-gray-700 p-1 rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-600/20 bg-gray-800/20">
        <button
          onClick={() => setActiveTab('services')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'services'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/20'
              : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/10'
          }`}
        >
          Services
        </button>
        <button
          onClick={() => setActiveTab('helm')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'helm'
              ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/20'
              : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/10'
          }`}
        >
          Helm Releases
        </button>
      </div>

      {/* Tab Content */}
      <div
        className="overflow-auto
          [&::-webkit-scrollbar]:w-1.5
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50"
        style={{
          height: `calc(${panelHeight} - ${headerRef.current?.offsetHeight || 40}px - 40px)`
        }}
      >
        {activeTab === 'services' && <ServiceDriftAnalysis />}
        {activeTab === 'helm' && <HelmDriftAnalysis />}
      </div>
    </div>
  );
};

export default DriftAnalysis;
