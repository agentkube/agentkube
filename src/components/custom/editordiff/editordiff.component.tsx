import React, { useEffect, useState, useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, FileText, CheckCircle, AlertCircle, Maximize2, Minimize2 } from 'lucide-react';
import { yamlToJson, jsonToYaml } from '@/utils/yaml';

interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

interface MonacoDiffEditorProps {
  // Original YAML content
  originalContent: string;
  // Current edited YAML content
  currentContent: string;
  // Language of the content (yaml, json, etc.)
  language?: string;
  // Editor theme
  theme?: 'vs-dark' | 'light';
  // Whether to format content before comparison
  formatBeforeCompare?: boolean;
  // Whether to show inline diffs
  renderSideBySide?: boolean;
  // Actions
  onApplyChanges?: () => void;
  onResetChanges?: () => void;
}

const MonacoDiffEditor: React.FC<MonacoDiffEditorProps> = ({
  originalContent,
  currentContent,
  language = 'yaml',
  theme = 'vs-dark',
  formatBeforeCompare = true,
  renderSideBySide = true,
  onApplyChanges,
  onResetChanges,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [processedOriginal, setProcessedOriginal] = useState(originalContent);
  const [processedCurrent, setProcessedCurrent] = useState(currentContent);
  const [diffStats, setDiffStats] = useState<DiffStats>({ added: 0, removed: 0, unchanged: 0 });
  const [hasDifferences, setHasDifferences] = useState(false);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);

  // Format content if needed
  useEffect(() => {
    const processContent = () => {
      if (formatBeforeCompare && language === 'yaml') {
        try {
          // Format YAML for consistent comparison
          const formattedOriginal = jsonToYaml(yamlToJson(originalContent));
          const formattedCurrent = jsonToYaml(yamlToJson(currentContent));
          
          setProcessedOriginal(formattedOriginal);
          setProcessedCurrent(formattedCurrent);
        } catch (error) {
          console.error("Error formatting YAML:", error);
          setProcessedOriginal(originalContent);
          setProcessedCurrent(currentContent);
        }
      } else {
        setProcessedOriginal(originalContent);
        setProcessedCurrent(currentContent);
      }
    };
    
    processContent();
  }, [originalContent, currentContent, formatBeforeCompare, language]);

  // Calculate diff statistics
  const calculateDiffStats = (editor: monaco.editor.IStandaloneDiffEditor) => {
    try {
      // Get line changes from the diff editor
      const lineChanges = editor.getLineChanges();
      
      if (!lineChanges) {
        setHasDifferences(false);
        setDiffStats({ added: 0, removed: 0, unchanged: 0 });
        return;
      }
      
      let addedLines = 0;
      let removedLines = 0;
      
      lineChanges.forEach(change => {
        // Calculate added lines
        if (change.modifiedEndLineNumber > 0) {
          addedLines += change.modifiedEndLineNumber - change.modifiedStartLineNumber + 1;
        }
        
        // Calculate removed lines
        if (change.originalEndLineNumber > 0) {
          removedLines += change.originalEndLineNumber - change.originalStartLineNumber + 1;
        }
      });
      
      // Calculate unchanged lines
      const modifiedModel = editor.getModifiedEditor().getModel();
      const totalLines = modifiedModel ? modifiedModel.getLineCount() : 0;
      const unchangedLines = totalLines - addedLines;
      
      setDiffStats({
        added: addedLines,
        removed: removedLines,
        unchanged: unchangedLines
      });
      
      setHasDifferences(addedLines > 0 || removedLines > 0);
    } catch (error) {
      console.error("Error calculating diff stats:", error);
    }
  };

  // Handle editor mount
  const handleEditorDidMount = (editor: monaco.editor.IStandaloneDiffEditor) => {
    diffEditorRef.current = editor;
    
    // Calculate initial diff stats
    calculateDiffStats(editor);
    
    // Set up listeners for diff changes
    const originalModel = editor.getOriginalEditor().getModel();
    const modifiedModel = editor.getModifiedEditor().getModel();
    
    if (originalModel && modifiedModel) {
      // Listen for model content changes
      const listener = modifiedModel.onDidChangeContent(() => {
        calculateDiffStats(editor);
      });
      
      return () => {
        listener.dispose();
      };
    }
  };

  // Toggle between side-by-side and inline diff views
  const toggleDiffView = () => {
    if (diffEditorRef.current) {
      const newValue = !renderSideBySide;
      diffEditorRef.current.updateOptions({ renderSideBySide: newValue });
    }
  };

  // DiffStatusIndicator component
  const DiffStatusIndicator = () => {
    if (!hasDifferences) {
      return (
        <div className="flex items-center text-green-600 dark:text-green-400">
          <CheckCircle className="h-4 w-4 mr-2" />
          <span>No differences</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center text-amber-500 dark:text-amber-400">
        <AlertCircle className="h-4 w-4 mr-2" />
        <span>
          {diffStats.added + diffStats.removed} change{diffStats.added + diffStats.removed !== 1 ? 's' : ''} detected
        </span>
      </div>
    );
  };

  return (
    <div className={`border rounded-lg overflow-hidden ${theme === 'vs-dark' ? 'bg-[#1e1e1e] border-gray-800' : 'bg-white border-gray-200'}`}>
      {/* Header */}
      <div className={`px-4 py-2 border-b flex justify-between items-center ${theme === 'vs-dark' ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center">
          <FileText className={`h-4 w-4 mr-2 ${theme === 'vs-dark' ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className="font-medium">Changes</span>
        </div>
        
        <div className="flex items-center space-x-4">
          <DiffStatusIndicator />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleDiffView}
            className="h-8 px-2"
          >
            {renderSideBySide ? (
              <>
                <EyeOff className="h-4 w-4 mr-1" />
                <span className="text-xs">Inline View</span>
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-1" />
                <span className="text-xs">Side-by-Side</span>
              </>
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 px-2"
          >
            {isExpanded ? (
              <>
                <Minimize2 className="h-4 w-4 mr-1" />
                <span className="text-xs">Collapse</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4 mr-1" />
                <span className="text-xs">Expand</span>
              </>
            )}
          </Button>
        </div>
      </div>
      
      {/* Statistics */}
      <div className={`px-4 py-2 border-b flex items-center space-x-4 text-sm ${theme === 'vs-dark' ? 'bg-[#2d2d2d] border-[#3c3c3c]' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-center">
          <span className="inline-block w-3 h-3 bg-green-500 rounded-full mr-2"></span>
          <span>{diffStats.added} addition{diffStats.added !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center">
          <span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-2"></span>
          <span>{diffStats.removed} deletion{diffStats.removed !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center">
          <span className={`inline-block w-3 h-3 rounded-full mr-2 ${theme === 'vs-dark' ? 'bg-gray-600' : 'bg-gray-300'}`}></span>
          <span>{diffStats.unchanged} unchanged</span>
        </div>
      </div>
      
      {/* Actions */}
      {hasDifferences && (
        <div className={`px-4 py-2 border-b flex justify-end space-x-2 ${theme === 'vs-dark' ? 'bg-blue-900/10 border-[#3c3c3c]' : 'bg-blue-50 border-gray-200'}`}>
          {onResetChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResetChanges}
              className="h-8"
            >
              Reset Changes
            </Button>
          )}
          
          {onApplyChanges && (
            <Button
              variant="default"
              size="sm"
              onClick={onApplyChanges}
              className="h-8 bg-blue-600 hover:bg-blue-700"
            >
              Apply Changes
            </Button>
          )}
        </div>
      )}
      
      {/* Monaco Diff Editor */}
      <div style={{ height: isExpanded ? '70vh' : '300px' }}>
        <DiffEditor
          original={processedOriginal}
          modified={processedCurrent}
          language={language}
          theme={theme}
          options={{
            renderSideBySide: renderSideBySide,
            enableSplitViewResizing: true,
            originalEditable: false,
            renderOverviewRuler: false,
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            minimap: { enabled: false },
  
            readOnly: true,
            automaticLayout: true,
            folding: true,
            renderIndicators: true,
            contextmenu: false,
            diffCodeLens: true,
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
              alwaysConsumeMouseWheel: false
            },
            stickyScroll: { enabled: true },
            diffWordWrap: 'off',
            renderWhitespace: 'boundary',
            ignoreTrimWhitespace: false,
            diffAlgorithm: 'advanced',
          }}
          onMount={handleEditorDidMount}
        />
      </div>
    </div>
  );
};

export default MonacoDiffEditor;