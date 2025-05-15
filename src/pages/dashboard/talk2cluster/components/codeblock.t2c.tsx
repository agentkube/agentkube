import React from 'react';
import { Check, ClipboardCopy, CirclePlay, Pencil, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from 'react';
import { ExecutionResult } from '@/types/cluster';
import { ExecuteCommand } from '@/api/internal/execute';
import { useCluster } from '@/contexts/clusterContext';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Cast Prism to the appropriate React component type
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface CodeBlockProps {
  language?: string;
  content: string;
  onContentChange?: (newContent: string) => void;
  highlightedLines?: number[];
}

export const CodeBlock = ({
  language = '',
  content: initialContent,
  onContentChange,
  highlightedLines = []
}: CodeBlockProps) => {
  const { currentContext } = useCluster();
  const [copied, setCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);

  // Update local content when prop changes
  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyOutput = async () => {
    if (result?.output) {
      await navigator.clipboard.writeText(result.output);
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  const parseKubectlCommand = (command: string): string[] => {
    const args = command
      .replace(/^kubectl\s+/, '')
      .match(/(?:[^\s"']+|['"][^'"]*["'])+/g) || [];

    return args.map(arg => arg.replace(/^['"]|['"]$/g, ''));
  };

  const handleExecute = async () => {
    if (!currentContext) {
      setError('No cluster selected. Please select a cluster first.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (!content.trim().startsWith('kubectl')) {
      setError('Only kubectl commands can be executed');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      setIsExecuting(true);
      setError(null);
      setResult(null);

      // const args = parseKubectlCommand(content.trim());
      const result = await ExecuteCommand(content, currentContext.name);
      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute command');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleEditComplete = () => {
    setIsEditing(false);
    onContentChange?.(content);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    onContentChange?.(newContent);
  };

  const showExecuteButton = language === 'bash' && content.includes('kubectl');

  // Custom styles for syntax highlighter
  const customStyle = {
    backgroundColor: 'transparent',
    margin: 0,
    padding: '0.5rem 0',
    fontSize: '0.875rem',
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
    <div className="relative my-4 rounded-xl bg-gray-900 text-gray-100">
      <div className="flex justify-between p-2 border-b border-gray-700 dark:border-gray-800">
        <div className="px-4 py-1 text-xs text-gray-400">
          {language}
        </div>
        <div className="flex">
          {showExecuteButton && (
            <button
              onClick={handleExecute}
              disabled={isExecuting || !currentContext}
              className="px-2 py-1 flex items-center justify-center rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={!currentContext ? 'Please select a cluster first' : ''}
            >
              <CirclePlay className="mr-2" size={14} />
              {isExecuting ? "Running..." : "Run"}
            </button>
          )}
          <button
            onClick={handleEdit}
            className="px-2 py-1 rounded-[0.3rem] ml-2 bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded-[0.3rem] ml-2 bg-gray-800 hover:bg-gray-700 text-gray-300"
          >
            {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
          </button>
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        {isEditing ? (
          <textarea
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onBlur={handleEditComplete}
            className="w-full bg-gray-800 text-gray-100 font-mono p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={content.split('\n').length}
            autoFocus
          />
        ) : (
          <SyntaxHighlighter
            language={language || 'text'}
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
            {content}
          </SyntaxHighlighter>
        )}
      </div>

      {error && (
        <div className="p-4 border-t border-gray-700 bg-red-900/20 text-red-200 rounded-b-xl">
          {error}
        </div>
      )}

      {result && (
        <div className="p-4 border-t border-gray-700 bg-gray-800 rounded-b-xl w-full overflow-x-auto">
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm text-gray-400">Command output:</div>
            <div className="flex gap-2">
              <button
                onClick={handleCopyOutput}
                className="flex items-center p-2 text-xs rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300"
              >
                {copiedOutput ? <Check size={14} /> : <ClipboardCopy size={14} />}
              </button>
              <button
                onClick={() => setIsDialogOpen(true)}
                className="flex items-center p-2 text-xs rounded-xl bg-gray-700 hover:bg-gray-600 text-gray-300"
              >
                <Maximize2 size={14} />
              </button>
            </div>
          </div>

          <SyntaxHighlighter
            language="shell"
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
            {result.output}
          </SyntaxHighlighter>
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-gray-200">
          <DialogHeader>
            <DialogTitle>Command Output</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh]">
            <SyntaxHighlighter
              language="shell"
              style={oneDark}
              customStyle={{
                ...customStyle,
                padding: '1rem',
                borderRadius: '0.5rem',
              }}
              wrapLines={true}
              wrapLongLines={true}
            >
              {result?.output || ''}
            </SyntaxHighlighter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CodeBlock;