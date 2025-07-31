// components/custom/ResourcePreview.tsx
import React, { useRef, useEffect, useState } from 'react';
import { X, Copy, Check, ExternalLink, ArrowUpLeft, ArrowUpRight, ChevronsUpDown } from 'lucide-react';
import { EnrichedSearchResult } from '@/types/search';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { nord } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CSSProperties } from 'react';
import { KUBERNETES } from '@/assets';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SiKubernetes } from '@icons-pack/react-simple-icons';
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface ResourcePreviewProps {
  resource: EnrichedSearchResult;
  onClose: () => void;
}

const ResourcePreview: React.FC<ResourcePreviewProps> = ({ resource, onClose }) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const navigate = useNavigate();

  const customStyle: CSSProperties = {
    padding: '0.5rem',
    borderRadius: '0.5rem',
    background: 'transparent',
    fontSize: '0.7rem'
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resource.resourceContent || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (previewRef.current && !previewRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleNavigate = () => {
    if (resource.namespaced) {
      navigate(`/dashboard/explore/${resource.resourceType}/${resource.namespace}/${resource.resourceName}`)
    } else {
      navigate(`/dashboard/explore/${resource.resourceType}/${resource.resourceName}`)
    }
  }

  return (
    <div
      ref={previewRef}
      className="absolute left-0 min-w-[45vw] bottom-full mb-1 w-full rounded-xl shadow-lg bg-gray-100/60 dark:bg-[#0B0D13]/40 backdrop-blur-md border border-gray-300 dark:border-gray-800/50 z-50"
    >
      <div className="flex items-center justify-between p-2 border-b bg-gray-300/30 dark:bg-gray-600/20 border-gray-200 dark:border-gray-500/30">
        <div className="flex items-center flex-wrap text-sm font-medium space-x-2">
          <SiKubernetes className='h-4 w-4' />
          <span className='text-xs cursor-pointer dark:text-gray-400  hover:dark:text-gray-300' onClick={handleNavigate}>
            {resource.resourceType}/{resource.resourceName}
          </span>
        </div>
        <div className='flex items-center space-x-2'>
          <ChevronsUpDown 
            onClick={handleToggleExpand}
            className="h-4 w-4 cursor-pointer dark:text-gray-500 hover:dark:text-gray-300" 
          />
          <ArrowUpRight onClick={handleNavigate} className="h-4 w-4 cursor-pointer dark:text-gray-500 hover:dark:text-gray-300" />
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className='h-4 w-4' />
          </button>
        </div>
      </div>

      <div className={`bg-gray-800 dark:bg-[#0B0D13]/40 relative group ${isExpanded ? 'max-h-96' : 'max-h-44'} overflow-auto
        rounded-b-lg shadow-lg
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50`}
      >
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 p-2 rounded-lg bg-neutral-700/80 dark:bg-neutral-800/50 hover:bg-gray-600 text-gray-200/60 hover:text-white z-10"
          aria-label="Copy code"
        >
          {copied ? (
            <Check className="w-3 h-3" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>

        <SyntaxHighlighter
          language="yaml"
          style={nord}
          customStyle={customStyle}
          wrapLines={true}
          showLineNumbers={true}
          lineNumberStyle={{
            color: '#262625',
          }}
        >
          {resource.resourceContent || '# No content available'}
        </SyntaxHighlighter>
      </div>
    </div>
  );
};

export default ResourcePreview;