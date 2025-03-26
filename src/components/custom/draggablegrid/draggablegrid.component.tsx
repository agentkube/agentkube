import React, { useState, ReactNode, MouseEvent } from 'react';
import { X, GripVertical } from 'lucide-react';

interface Position {
  x: number;
  y: number;
}

interface DraggableItemProps {
  children: ReactNode;
  onRemove: () => void;
  wide?: boolean;
}

interface Monitor {
  id: number;
  isWide: boolean;
}

const DraggableItem: React.FC<DraggableItemProps> = ({ children, onRemove, wide = false }) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });

  const handleDragStart = (e: MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleDrag = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      className={`absolute bg-gray-50 rounded-xl shadow-md border border-gray-200 
        ${wide ? 'w-[66%]' : 'w-[32%]'} 
        ${isDragging ? 'cursor-grabbing z-50' : 'cursor-grab'}
        transition-shadow duration-200 hover:shadow-lg`}
      style={{
        transform: `translate(${position.x}px, ${position.y}px)`,
        height: '300px'
      }}
    >
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-200 bg-white rounded-t-xl"
        onMouseDown={handleDragStart}
        onMouseMove={handleDrag}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-gray-400" />
          <span className="font-medium">Monitor</span>
        </div>
        <button 
          onClick={onRemove}
          className="p-1 hover:bg-gray-100 rounded-lg"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="p-4 h-[calc(100%-48px)]">
        {children}
      </div>
    </div>
  );
};

const DraggableGrid: React.FC = () => {
  const [monitors, setMonitors] = useState<Monitor[]>([]);

  const addMonitor = (isWide = false) => {
    setMonitors(prev => [...prev, { 
      id: Date.now(),
      isWide 
    }]);
  };

  const removeMonitor = (id: number) => {
    setMonitors(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="relative min-h-screen p-6 bg-gray-100">
      <div className="mb-6 flex gap-4">
        <button 
          onClick={() => addMonitor(false)}
          className="px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800"
        >
          Add Square Monitor
        </button>
        <button 
          onClick={() => addMonitor(true)}
          className="px-4 py-2 bg-black text-white rounded-xl hover:bg-gray-800"
        >
          Add Wide Monitor
        </button>
      </div>

      <div className="relative w-full">
        {monitors.map((monitor) => (
          <DraggableItem 
            key={monitor.id}
            wide={monitor.isWide}
            onRemove={() => removeMonitor(monitor.id)}
          >
            {/* Placeholder for monitoring content */}
            <div className="h-full flex items-center justify-center text-gray-400">
              Monitoring Content
            </div>
          </DraggableItem>
        ))}
      </div>
    </div>
  );
};

export default DraggableGrid;