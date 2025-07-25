import React, { useState } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighter } from 'shiki';
import { themeSlugs } from '@/constants/theme.constants';
import { Button } from "@/components/ui/button";
import { Computer, X } from "lucide-react";

interface AddMCPConfigProps {
  onClose: () => void;
  onSave: (config: any) => void;
  tool: {
    id: string;
    name: string;
    description: string;
    icon: React.ReactElement;
    iconBg: string;
    type?: string;
  };
}

const AddMCPConfig: React.FC<AddMCPConfigProps> = ({ onClose, onSave, tool }) => {
  const [jsonConfig, setJsonConfig] = useState(`{
  "mcpServers": {
    "${tool.name}": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-${tool.id}"
      ],
      "env": {}
    }
  }
}`);

  // Get theme from localStorage
  const [editorTheme] = useState<string>(() => {
    const cached = localStorage.getItem('editor_theme');
    return cached || 'github-dark';
  });

  const handleEditorDidMount: OnMount = async (editor, monaco) => {
    const highlighter = await createHighlighter({
      themes: themeSlugs,
      langs: ['json', 'yaml', 'typescript', 'javascript', 'go', 'rust', 'nginx', 'python', 'java'],
    });

    // Register Shiki themes with Monaco
    shikiToMonaco(highlighter, monaco);

    // Activate the requested theme
    monaco.editor.setTheme(editorTheme);
  };

  const handleSave = () => {
    try {
      const config = JSON.parse(jsonConfig);
      onSave(config);
    } catch (error) {
      console.error('Invalid JSON:', error);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setJsonConfig(value);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 px-16 top-5 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-[#0B0D13]/50 backdrop-blur-md border dark:border-gray-700/30 rounded-lg w-[600px] max-w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 ${tool.iconBg} dark:text-black rounded-md flex items-center justify-center`}>
              {tool.icon}
            </div>
            <div className='flex items-center space-x-2'>
              <h3 className="text-lg font-semibold dark:text-white">{tool.name}</h3>
              {tool.type && (
                <div className='flex items-center bg-gray-500/20 px-2 space-x-1 rounded-md text-gray-500 dark:text-blue-400'>
                  <Computer className='h-3 w-3' /> 
                  <span className="text-sm">{tool.type}</span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Please copy the configuration JSON from the MCP server's{' '}
            <span className="underline">introduction page</span>{' '}
            (preferably use <strong>NPX</strong> or <strong>UVX</strong> configuration) 
            and paste it into the input field.
          </p>
          
          <div className="relative">
            <div className="absolute top-2 right-2 z-10">
              <span className="bg-gray-100 dark:bg-gray-700/50 backdrop-blur-md text-xs px-2 py-1 rounded text-gray-600 dark:text-gray-300">
                JSON Preview
              </span>
            </div>
            <div className="border dark:border-gray-600 rounded-lg overflow-hidden">
              <MonacoEditor
                height="280px"
                defaultLanguage="json"
                value={jsonConfig}
                onChange={handleEditorChange}
                theme={editorTheme}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  roundedSelection: false,
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  automaticLayout: true,
                  quickSuggestions: true,
                  formatOnPaste: true,
                  formatOnType: true,
                  wordWrap: 'on'
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="w-4 h-4 bg-yellow-500 rounded-sm flex items-center justify-center">
              <span className="text-yellow-900 text-xs">⚠</span>
            </div>
            <span>No Information Needed</span>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose} className="dark:border-gray-600">
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              className="dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              Confirm
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddMCPConfig;