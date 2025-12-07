import React, { useState, useRef, useEffect } from 'react';
import { Terminal, X, Copy, Check, ChevronsUpDown } from 'lucide-react';
import { LogsSelection } from '@/types/logs';

interface ResourceLogPreviewProps {
  log: LogsSelection;
  onRemove: () => void;
}

const ResourceLogPreview: React.FC<ResourceLogPreviewProps> = ({ log, onRemove }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(log.logs || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (previewRef.current && !previewRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={previewRef}>
      <div
        className="flex items-center text-xs bg-gray-100 dark:bg-gray-800/10 border border-gray-300 dark:border-gray-800 rounded p-1 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-1">
          <div className='bg-gray-400/20 dark:bg-gray-500/20 p-0.5 rounded-sm'>
            <Terminal className='h-3 w-3' />
          </div>
          <span>{log.podName}/{log.containerName}</span>
          <span className='text-gray-400'>(100)</span>
        </div>
        <X
          size={12}
          className="ml-1 cursor-pointer hover:text-red-500"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      </div>

      {/* Tooltip/Preview */}
      {isOpen && (
        <div className="absolute left-0 min-w-[45vw] bottom-full mb-1 w-full rounded-xl shadow-lg bg-gray-100/60 dark:bg-[#0B0D13]/40 backdrop-blur-md border border-gray-300 dark:border-gray-800/50 z-[60]">
          {/* Header */}
          <div className="flex items-center justify-between p-2 border-b bg-gray-300/30 dark:bg-gray-600/20 border-gray-200 dark:border-gray-500/30">
            <div className="flex items-center flex-wrap text-sm font-medium space-x-2">
              <Terminal className='h-4 w-4' />
              <span className='text-xs dark:text-gray-400'>
                {log.podName}/{log.containerName}
              </span>
            </div>
            <div className='flex items-center space-x-2'>
              <button
                onClick={handleCopy}
                className="h-4 w-4 cursor-pointer dark:text-gray-500 hover:dark:text-gray-300"
                title="Copy logs"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <X className='h-4 w-4' />
              </button>
            </div>
          </div>

          {/* Logs Content */}
          <div className={`bg-gray-800 dark:bg-[#0B0D13]/40 relative group ${isExpanded ? 'max-h-96' : 'max-h-44'} overflow-auto
            rounded-b-lg shadow-lg
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50`}
          >
            <div className="p-3 font-mono text-xs">
              <pre className="whitespace-pre-wrap text-gray-200 dark:text-gray-300 leading-relaxed">
                {log.logs || '# No logs available'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceLogPreview;