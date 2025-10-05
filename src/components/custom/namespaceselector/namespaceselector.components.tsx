import React, { useState, useEffect } from 'react';
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNamespace } from '@/contexts/useNamespace';

interface NamespaceSelectorProps {
  onSelectionChange?: (namespaces: string[]) => void;
  className?: string;
}

export const NamespaceSelector: React.FC<NamespaceSelectorProps> = ({ 
  onSelectionChange,
  className 
}) => {
  const { availableNamespaces, selectedNamespaces, setSelectedNamespaces } = useNamespace();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Ensure we have arrays, not undefined
  const safeAvailableNamespaces = availableNamespaces || [];
  const safeSelectedNamespaces = selectedNamespaces || [];

  // Handle namespace selection toggle
  const handleSelect = (namespace: string) => {
    let newSelected: string[];
    
    // If already selected, remove it; otherwise add it
    if (safeSelectedNamespaces.includes(namespace)) {
      newSelected = safeSelectedNamespaces.filter(ns => ns !== namespace);
    } else {
      newSelected = [...safeSelectedNamespaces, namespace];
    }
    
    setSelectedNamespaces(newSelected);
    
    if (onSelectionChange) {
      onSelectionChange(newSelected);
    }
  };

  // Select all namespaces
  const selectAll = () => {
    setSelectedNamespaces([...safeAvailableNamespaces]);
    
    if (onSelectionChange) {
      onSelectionChange([...safeAvailableNamespaces]);
    }
  };

  // Clear all selected namespaces
  const clearAll = () => {
    setSelectedNamespaces([]);
    
    if (onSelectionChange) {
      onSelectionChange([]);
    }
  };

  // Get filtered namespaces based on search term
  const filteredNamespaces = safeAvailableNamespaces.filter(
    ns => ns.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get display text for the button
  const getDisplayText = () => {
    if (safeSelectedNamespaces.length === 0) {
      return "No namespaces selected";
    } else if (safeSelectedNamespaces.length === safeAvailableNamespaces.length) {
      return "All namespaces";
    } else if (safeSelectedNamespaces.length === 1) {
      return safeSelectedNamespaces[0];
    } else {
      return `${safeSelectedNamespaces.length} namespaces selected`;
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-full p-2.5 justify-between text-gray-800 dark:text-gray-400 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-800/60"
          >
            <span className="truncate text-sm">{getDisplayText()}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 bg-gray-100 dark:bg-[#0B0D13]/50 backdrop-blur-md border-gray-200 dark:border-gray-800/60 " align="start">
          <div className="p-1">
            <input
              className="w-full px-2 py-1 text-sm bg-gray-100 dark:bg-gray-800/30 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-800"
              placeholder="Search namespaces..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 p-2 border-t border-b ">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={selectAll}
              className="text-xs"
            >
              Select All
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearAll}
              className="text-xs"
            >
              Clear All
            </Button>
          </div>
          
          {filteredNamespaces.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-500">
              No namespaces found
            </div>
          ) : (
            <div className="max-h-64 overflow-auto  [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700/30 [&::-webkit-scrollbar-thumb]:rounded-full[&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
              {filteredNamespaces.map((namespace) => (
                <div
                  key={namespace}
                  className={cn(
                    "relative flex cursor-pointer  select-none items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 dark:hover:bg-slate-800",
                    safeSelectedNamespaces.includes(namespace) ? "bg-slate-100 dark:bg-gray-700/20 backdrop-blur-xs " : ""
                  )}
                  onClick={() => handleSelect(namespace)}
                >
                  <span>{namespace}</span>
                  {safeSelectedNamespaces.includes(namespace) && (
                    <Check className="h-4 w-4" />
                  )}
                </div>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>
      
      {/* Selected namespaces badges */}
      {safeSelectedNamespaces.length > 0 && safeSelectedNamespaces.length < safeAvailableNamespaces.length && (
        <div className="flex flex-wrap gap-1 mt-2">
          {safeSelectedNamespaces.slice(0, 5).map(namespace => (
            <Badge 
              key={namespace} 
              variant="secondary"
              className="text-xs text-gray-800 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800/60"
            >
              {namespace}
              <button 
                className="ml-1 text-gray-500 hover:text-gray-700"
                onClick={() => handleSelect(namespace)}
              >
                ×
              </button>
            </Badge>
          ))}
          {safeSelectedNamespaces.length > 5 && (
            <Badge variant="outline" className="text-xs bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800/60">
              +{safeSelectedNamespaces.length - 5} more
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};

export default NamespaceSelector;