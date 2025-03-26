import React from 'react';
import * as yaml from 'yaml';

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
  try {
    const yamlString = yaml.stringify(data, { indent: 2, lineWidth: -1 }); 
    
    return (
      <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-md overflow-auto text-sm font-mono
        max-h-[70vh] overflow-y-auto
        scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
        {yamlString}
      </pre>
    );
  } catch (error) {
    console.error("YAML parsing error:", error);
    return <div>Error rendering YAML: {String(error)}</div>;
  }
};
