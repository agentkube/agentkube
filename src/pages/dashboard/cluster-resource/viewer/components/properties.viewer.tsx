import React, { useState } from 'react';
import { V1ObjectMeta } from '@kubernetes/client-node';
import { calculateAge } from '@/utils/age';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { useNavigate } from 'react-router-dom';
interface PropertiesViewerProps {
  metadata: V1ObjectMeta;
  kind: string;
  status?: string;
  additionalProperties?: {
    label: string;
    value: React.ReactNode;
  }[];
}

const PropertiesViewer: React.FC<PropertiesViewerProps> = ({
  metadata,
  kind,
  status,
  additionalProperties = []
}) => {
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [showAllAnnotations, setShowAllAnnotations] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();
  
  // Format creation time to human-readable format
  const formatTimestamp = (timestamp?: string): string => {
    if (!timestamp) return 'N/A';
    
    try {
      const creationDate = new Date(timestamp);
      const age = calculateAge(timestamp);
      return `${age} (${creationDate.toLocaleString()})`;
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return timestamp;
    }
  };

  // Handle copy resource name
  const handleCopyResource = () => {
    if (metadata.name) {
      navigator.clipboard.writeText(metadata.name)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
        })
        .catch(err => {
          console.error('Failed to copy text: ', err);
        });
    }
  };

  // Get labels for display with expand/collapse functionality
  const getLabelsElement = () => {
    if (!metadata.labels || Object.keys(metadata.labels).length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No labels</span>;
    }

    const labelsToShow = showAllLabels 
      ? Object.entries(metadata.labels) 
      : Object.entries(metadata.labels).slice(0, 3);
    
    return (
      <div className="flex flex-col space-y-2">
        <div className="flex flex-wrap gap-2">
          {labelsToShow.map(([key, value]) => (
            <Badge 
              key={key} 
              variant="outline" 
              className="text-xs font-normal px-2 py-1 bg-gray-100 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-800"
            >
              <span className="font-medium">{key}</span>: {value}
            </Badge>
          ))}
        </div>
        
        {Object.keys(metadata.labels).length > 3 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-fit text-xs text-blue-600 dark:text-blue-400 p-0 h-auto hover:bg-transparent hover:underline"
            onClick={() => setShowAllLabels(!showAllLabels)}
          >
            {showAllLabels ? (
              <span className="flex items-center">
                <ChevronUp className="h-3 w-3 mr-1" />
                Show fewer labels
              </span>
            ) : (
              <span className="flex items-center">
                <ChevronDown className="h-3 w-3 mr-1" />
                Show all {Object.keys(metadata.labels).length} labels
              </span>
            )}
          </Button>
        )}
      </div>
    );
  };

  // Get annotations for display with expand/collapse functionality
  const getAnnotationsElement = () => {
    if (!metadata.annotations || Object.keys(metadata.annotations).length === 0) {
      return <span className="text-gray-500 dark:text-gray-400">No annotations</span>;
    }

    const annotationsToShow = showAllAnnotations 
      ? Object.entries(metadata.annotations) 
      : Object.entries(metadata.annotations).slice(0, 2);
    
    return (
      <div className="flex flex-col space-y-2">
        <div className="flex flex-col gap-2">
          {annotationsToShow.map(([key, value]) => (
            <div 
              key={key} 
              className="text-xs bg-gray-100 dark:bg-gray-800/30 w-fit px-2 py-1 rounded border border-gray-300 dark:border-gray-800"
            >
              <span className="font-medium">{key}:</span> {value.length > 100 ? `${value.substring(0, 100)}...` : value}
            </div>
          ))}
        </div>
        
        {Object.keys(metadata.annotations).length > 2 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-fit text-xs text-blue-600 dark:text-blue-400 p-0 h-auto hover:bg-transparent hover:underline"
            onClick={() => setShowAllAnnotations(!showAllAnnotations)}
          >
            {showAllAnnotations ? (
              <span className="flex items-center">
                <ChevronUp className="h-3 w-3 mr-1" />
                Show fewer annotations
              </span>
            ) : (
              <span className="flex items-center">
                <ChevronDown className="h-3 w-3 mr-1" />
                Show all {Object.keys(metadata.annotations).length} annotations
              </span>
            )}
          </Button>
        )}
      </div>
    );
  };
  
  // Get status element with appropriate color based on the status
  const getStatusElement = () => {
    if (!status) return null;
    
    let statusColor = "text-gray-600 dark:text-gray-400";
    
    switch (status.toLowerCase()) {
      case 'running':
      case 'active':
      case 'ready':
      case 'succeeded':
        statusColor = "text-green-600 dark:text-green-400 font-medium";
        break;
      case 'pending':
      case 'waiting':
        statusColor = "text-yellow-500 dark:text-yellow-500 font-medium";
        break;
      case 'failed':
      case 'error':
        statusColor = "text-red-600 dark:text-red-400 font-medium";
        break;
    }
    
    return <span className={statusColor}>{status}</span>;
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800/40 bg-white dark:bg-transparent p-4 mb-6">
      <h2 className="text-lg font-medium mb-4">Properties</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="flex flex-col">
            <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">Name</span>
            <div className="flex items-center">
              <span className="font-medium">{metadata.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-2 p-1 h-6 w-6"
                onClick={handleCopyResource}
                title="Copy resource name"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-500 hover:text-gray-800 dark:hover:text-gray-300" />
                )}
              </Button>
            </div>
          </div>
          
          {metadata.namespace && (
            <div className="flex flex-col">
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">Namespace</span>
              <span className="font-medium text-blue-500 hover:text-blue-500 hover:underline cursor-pointer" onClick={() => navigate(`/dashboard/explore/namespaces/${metadata.namespace}`)}>{metadata.namespace}</span>
            </div>
          )}
          
          <div className="flex flex-col">
            <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">Created</span>
            <span>{formatTimestamp(metadata.creationTimestamp?.toString())}</span>
          </div>
          
          {status && (
            <div className="flex flex-col">
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">Status</span>
              {getStatusElement()}
            </div>
          )}
          
          {additionalProperties.map((prop, index) => (
            <div key={index} className="flex flex-col">
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">{prop.label}</span>
              <div>{prop.value}</div>
            </div>
          ))}
        </div>
        
        <div className="space-y-4">
          <div className="flex flex-col">
            <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">Labels</span>
            {getLabelsElement()}
          </div>
          
          <div className="flex flex-col">
            <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">Annotations</span>
            {getAnnotationsElement()}
          </div>
          
          {metadata.ownerReferences && metadata.ownerReferences.length > 0 && (
            <div className="flex flex-col">
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">Controlled By</span>
              <div className="space-y-1">
                {metadata.ownerReferences.map((ref, index) => (
                  <div key={index} >
                    {ref.kind} <span className="text-blue-600 dark:text-blue-400 hover:text-blue-500 hover:underline cursor-pointer" onClick={() => navigate(`/dashboard/explore/${ref.kind?.toLocaleLowerCase()+'s'}/${metadata.namespace}/${ref.name}`)}>{ref.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {metadata.uid && (
            <div className="flex flex-col">
              <span className="text-sm text-gray-500 dark:text-gray-400 mb-1">UUID</span>
              <span className="text-xs font-mono">{metadata.uid}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PropertiesViewer;