import React, { useRef, KeyboardEvent, useCallback } from 'react';
import { Check, ClipboardCopy, CirclePlay, Pencil, Maximize2, AlertCircle, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect } from 'react';
import { ExecutionResult } from '@/types/cluster';
// import { ExecuteCommand } from '@/api/internal/execute';
import { useCluster } from '@/contexts/clusterContext';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { executeCommand } from '@/api/orchestrator.chat';
import { useTheme } from 'next-themes';
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
  const [isFocused, setIsFocused] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [commandSuccess, setCommandSuccess] = useState<boolean | null>(null);
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      setCommandSuccess(null);
      setShowOutput(false);

      const result = await executeCommand(content, currentContext.name);
      setResult(result);
      setCommandSuccess(result.success);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute command');
      setCommandSuccess(false);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleEditComplete = () => {
    setIsEditing(false);
    onContentChange?.(content);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    onContentChange?.(newContent);
  };

  const handleFocus = () => {
    setIsFocused(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    // Check for Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (showExecuteButton) {
        handleExecute();
      }
    }
  }, [content, currentContext]);

  const showExecuteButton = language === 'bash' && content.includes('kubectl');

  // Custom styles for syntax highlighter
  const customStyle = {
    backgroundColor: 'transparent',
    margin: 0,
    padding: '0.5rem 0',
    fontSize: '0.875rem',
    color: theme === "dark" ? "#f2f2f2CC" : "#000000"
    // color: '#000000',
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
    <div 
      ref={containerRef}
      className={`relative my-4 rounded-xl bg-gray-300/50 dark:bg-gray-800/10 text-gray-100 border border-gray-700/20 dark:border-gray-800 ${isFocused ? 'ring-2  dark:ring-gray-800' : ''}`} 
      tabIndex={0}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <div className="flex justify-between p-2 dark:border-gray-800">
        <div className="px-4 py-1 text-xs text-gray-400 flex items-center">
          <span className="text-xs text-gray-700 dark:text-gray-300">
            {language}
          </span>
          {commandSuccess !== null && (
            <span className="ml-2">
              {commandSuccess ? (
                <Check size={14} className="text-green-500" />
              ) : (
                <AlertCircle size={14} className="text-red-500" />
              )}
            </span>
          )}
        </div>
        <div className="flex">
          {showExecuteButton && (
            <button
              onClick={handleExecute}
              disabled={isExecuting || !currentContext}
              className="px-2 py-1 transition-all  flex items-center justify-center rounded-[0.3rem] bg-transparent dark:bg-transparent hover:bg-gray-500/20 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={!currentContext ? 'Please select a cluster first' : 'Run (Cmd+Enter)'}
            >
              <CirclePlay className="mr-2" size={14} />
              {isExecuting ? "Running..." : <span className="text-xs">Run (⌘ + Enter)</span>}
            </button>
          )}
          <button
            onClick={handleEdit}
            className="px-2 py-1 transition-all rounded-[0.3rem] ml-2 bg-transparent dark:bg-transparent hover:bg-gray-500/20 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleCopy}
            className="px-2 py-1 transition-all rounded-[0.3rem] ml-2 bg-transparent dark:bg-transparent hover:bg-gray-500/20 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      <div className="p-4 overflow-x-auto">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onBlur={handleEditComplete}
            className="w-full bg-gray-300/50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-mono p-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={content.split('\n').length}
            autoFocus
          />
        ) : (
          <SyntaxHighlighter
            language={language || 'text'}
            style={oneDark}
            customStyle={customStyle}
            showLineNumbers={language !== 'bash' ? true : false}
            wrapLines={true}
            lineProps={lineProps}
            lineNumberStyle={{
              minWidth: '1em',
              paddingRight: '0.5em',
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
        <>
          {!showOutput ? (
            <div className="px-4 py-2 border-t dark:border-gray-700 bg-gray-300 dark:bg-gray-800 rounded-b-xl">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <span className="text-xs text-gray-700 dark:text-gray-400 mr-2">Command {result.success ? 'succeeded' : 'failed'}</span>
                  {result.success ? (
                    <Check size={14} className="text-green-500" />
                  ) : (
                    <AlertCircle size={14} className="text-red-500" />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowOutput(true)}
                    className="flex items-center transition-all  px-2 py-1 text-xs rounded-[0.3rem] bg-transparent dark:bg-gray-700 hover:bg-gray-500/20 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                  >
                    Show Output
                  </button>
                  <button
                    onClick={() => setIsDialogOpen(true)}
                    className="flex items-center transition-all  px-2 py-1 text-xs rounded-[0.3rem] bg-transparent dark:bg-gray-700 hover:bg-gray-500/20 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                  >
                    <Maximize2 size={14} className="mr-1" />
                    Expand
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-gray-300 dark:bg-gray-800/50 rounded-b-xl w-full overflow-x-auto">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm text-gray-400">Command output</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowOutput(false)}
                  className="flex items-center px-2 py-1 text-xs rounded-[0.3rem] bg-transparent dark:bg-transparent hover:bg-gray-500/20 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  Hide
                </button>
                <button
                  onClick={handleCopyOutput}
                  className="flex items-center p-2 text-xs rounded-[0.3rem] bg-transparent dark:bg-transparent hover:bg-gray-500/20 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  {copiedOutput ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => setIsDialogOpen(true)}
                  className="flex items-center p-2 text-xs rounded-[0.3rem] bg-transparent dark:bg-transparent hover:bg-gray-500/20 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
                >
                  <Maximize2 size={14} />
                </button>
              </div>
            </div>
          
            <SyntaxHighlighter
              language="shell"
              style={oneDark}
              customStyle={{
                ...customStyle,
                overflowX: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(120, 125, 132, 0.3) transparent',
              }}
              // showLineNumbers={true}
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
        </>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-gray-200 dark:bg-[#0B0D13]">
          <DialogHeader>
            <DialogTitle>Command Output</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh]        
            overflow-y-auto py-1 
            
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
          ">
            <div className="px-4 py-2 text-xs text-gray-800 dark:text-gray-400 bg-gray-300 dark:bg-gray-500/10 rounded-t-[0.5rem] w-full overflow-x-auto">
              {language}
            </div>
            <SyntaxHighlighter
              language="bash"
              style={oneDark}
              customStyle={{
                ...customStyle,
                backgroundColor: '#282C34',
                padding: '1rem',
                // borderRadius: '0.5rem',
                overflowX: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(120, 125, 132, 0.3) transparent',
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