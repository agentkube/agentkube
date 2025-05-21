import React, { useState, useMemo } from 'react';
import * as yaml from 'yaml';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Search, X } from 'lucide-react';

// Cast Prism to the appropriate React component type
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

// Helper function to read a YAML file input
export const readYamlFile = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      if (event.target?.result) {
        resolve(event.target.result as string);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
};

export const YamlViewer = ({ data }: { data: any }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  try {
    const yamlString = yaml.stringify(data, { indent: 2, lineWidth: -1 }); 
    
    // Get highlighted lines based on search term
    const highlightedLines = useMemo(() => {
      if (!searchTerm.trim()) return [];
      
      const lines = yamlString.split('\n');
      const searchTermLower = searchTerm.toLowerCase();
      const matchedLines: number[] = [];
      
      lines.forEach((line, index) => {
        if (line.toLowerCase().includes(searchTermLower)) {
          matchedLines.push(index + 1); // Line numbers are 1-based
        }
      });
      
      return matchedLines;
    }, [yamlString, searchTerm]);
    
    // Custom styles for syntax highlighter to match your existing styling
    const customStyle = {
      backgroundColor: 'transparent',
      margin: 0,
      padding: '1rem',
      fontSize: '0.875rem',
      fontFamily: 'Monaco, Menlo, monospace',
      borderRadius: '0.5rem',
    };
    
    // Line props function to handle highlighted lines
    const lineProps = (lineNumber: number) => {
      const style = {
        display: 'block',
        backgroundColor: highlightedLines.includes(lineNumber) ? 'rgba(255, 229, 100, 0.2)' : 'transparent',
        padding: '0 1rem',
      };
      return { style };
    };
    
    return (
      <div className="bg-gray-100 dark:bg-gray-400/10 rounded-lg overflow-hidden text-sm">
        {/* Search Header */}
        <div className="flex justify-between items-center p-2 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">YAML</span>
            {searchTerm && (
              <span className="text-xs text-green-600 dark:text-green-400">
                {highlightedLines.length} matches
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isSearchOpen ? (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search..."
                    className="pl-7 pr-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded 
                             bg-white dark:bg-gray-400/20 text-gray-900 dark:text-gray-100
                             focus:outline-none  w-60"
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => {
                    setIsSearchOpen(false);
                    setSearchTerm('');
                  }}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsSearchOpen(true)}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
              >
                <Search size={16} />
              </button>
            )}
          </div>
        </div>
        
        {/* YAML Content */}
        <div className="max-h-[70vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
          <SyntaxHighlighter
            language="yaml"
            style={oneDark}
            customStyle={customStyle}
            showLineNumbers={true}
            wrapLines={true}
            lineProps={lineProps}
            lineNumberStyle={{
              minWidth: '2em',
              paddingRight: '1em',
              color: '#606366',
              textAlign: 'right',
              userSelect: 'none',
              marginRight: '0.5rem',
              borderRight: '1px solid #404040',
            }}
            codeTagProps={{
              style: {
                fontSize: '0.875rem',
                fontFamily: 'Monaco, Menlo, monospace',
              }
            }}
          >
            {yamlString}
          </SyntaxHighlighter>
        </div>
      </div>
    );
  } catch (error) {
    console.error("YAML parsing error:", error);
    return (
      <div className="bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-lg">
        Error rendering YAML: {String(error)}
      </div>
    );
  }
};