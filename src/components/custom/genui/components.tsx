import React from 'react';

// Sample ResourceList component - renders a colorful card for list_resources
interface ResourceListProps {
  command?: string;
  output?: string;
}

const ResourceListComponent: React.FC<ResourceListProps> = ({ command, output }) => {
  return (
    <div className="my-4 p-4 rounded-lg bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
      <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-300 mb-2">
        🎨 Custom GenUI Component - Resource List
      </h3>
      <div className="space-y-2">
        {command && (
          <div className="text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Command:</span>
            <code className="ml-2 bg-gray-800 text-green-400 px-2 py-1 rounded text-xs">
              {command}
            </code>
          </div>
        )}
        {output && (
          <div className="text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">Output:</span>
            <pre className="mt-1 bg-gray-800 text-gray-200 p-2 rounded text-xs overflow-auto max-h-48">
              {output}
            </pre>
          </div>
        )}
        <div className="mt-3 text-xs text-purple-600 dark:text-purple-400 italic">
          ✨ This is a custom GenUI component rendered for list_resources tool
        </div>
      </div>
    </div>
  );
};

// Component map - maps tool names to React components
export const ComponentMap = {
  sample_tool_name: ResourceListComponent,
  // Add more component mappings here as needed
  // example: kubectl_get: KubectlGetComponent,
};

export type ComponentMapType = typeof ComponentMap;
