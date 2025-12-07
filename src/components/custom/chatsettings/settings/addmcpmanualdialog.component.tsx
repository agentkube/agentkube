import React, { useState } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighter } from 'shiki';
import { themeSlugs } from '@/constants/theme.constants';
import { Button } from "@/components/ui/button";
import { X, ExternalLink, ArrowUpRight } from "lucide-react";
import { updateMcpConfig, getMcpConfig } from '@/api/settings';
import { toast } from '@/hooks/use-toast';
import { openExternalUrl } from '@/api/external';
import { SiAnthropic, SiModelcontextprotocol, SiModelcontextprotocolHex } from '@icons-pack/react-simple-icons';

interface AddMCPManualDialogProps {
  onClose: () => void;
  onSave: (config: any) => void;
}

const AddMCPManualDialog: React.FC<AddMCPManualDialogProps> = ({ onClose, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [jsonConfig, setJsonConfig] = useState(JSON.stringify({
    mcpServers: {}
  }, null, 2));

  // Get theme from localStorage
  const [editorTheme] = useState<string>(() => {
    const cached = localStorage.getItem('editor_theme');
    return cached || 'github-dark';
  });

  const handleEditorDidMount: OnMount = async (_, monaco) => {
    const highlighter = await createHighlighter({
      themes: themeSlugs,
      langs: ['json', 'yaml', 'typescript', 'javascript', 'go', 'rust', 'nginx', 'python', 'java'],
    });

    // Register Shiki themes with Monaco
    shikiToMonaco(highlighter, monaco);

    // Activate the requested theme
    monaco.editor.setTheme(editorTheme);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const parsedConfig = JSON.parse(jsonConfig);

      // Get current MCP config
      const currentMcpConfig = await getMcpConfig();

      // Merge the new server configuration
      const updatedMcpConfig = {
        ...currentMcpConfig,
        mcpServers: {
          ...currentMcpConfig.mcpServers,
          ...parsedConfig.mcpServers
        }
      };

      // Update the MCP configuration
      await updateMcpConfig(updatedMcpConfig);

      toast({
        title: "MCP Configuration Added",
        description: "Manual MCP configuration has been successfully saved.",
        variant: "success"
      });

      onSave(updatedMcpConfig);
    } catch (error) {
      console.error('Error saving MCP config:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save MCP configuration",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setJsonConfig(value);
    }
  };

  const handleOpenDocs = async () => {
    try {
      await openExternalUrl('https://docs.agentkube.com');
    } catch (error) {
      console.error('Error opening documentation:', error);
      toast({
        title: "Error",
        description: "Failed to open documentation",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 px-16 top-5 flex items-center justify-center z-50">
      <div className="bg-card backdrop-blur-md border border-border rounded-lg w-[600px] max-w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 text-foreground rounded-md flex items-center justify-center">
              <SiModelcontextprotocol />
            </div>
            <div className='flex items-center space-x-2'>
              <h3 className="text-lg font-semibold text-foreground">Add Manually</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground">
              Configure your MCP server manually by editing the JSON below.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenDocs}
              className="flex items-center space-x-1 text-xs"
            >
              <span>Learn More</span>
              <ArrowUpRight className="w-3 h-3" />
            </Button>
          </div>

          <div className="relative">
            <div className="absolute top-2 right-2 z-10">
              <span className="bg-secondary backdrop-blur-md text-xs px-2 py-1 rounded text-foreground">
                JSON Configuration
              </span>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
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
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs">i</span>
            </div>
            <span>Manual Configuration</span>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" onClick={onClose} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {loading ? 'Adding...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddMCPManualDialog;