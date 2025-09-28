import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Terminal, Wrench, Copy, Check } from 'lucide-react';
import { ToolCall } from '@/api/orchestrator.chat';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';

// Cast Prism to the appropriate React component type
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface ToolCallAccordionProps {
  toolCall: ToolCall;
}

const ToolCallAccordion: React.FC<ToolCallAccordionProps> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showFullOutput, setShowFullOutput] = useState(false);
  const { theme } = useTheme();

  // Memoize parsed JSON to avoid re-parsing on every render
  const parsedArguments = useMemo(() => {
    if (!toolCall.arguments) return null;
    try {
      return JSON.parse(toolCall.arguments);
    } catch (error) {
      console.warn('Failed to parse tool call arguments:', error);
      return toolCall.arguments;
    }
  }, [toolCall.arguments]);

  // Memoize formatted arguments string
  const formattedArguments = useMemo(() => {
    if (!parsedArguments) return '';
    if (typeof parsedArguments === 'string') return parsedArguments;
    return JSON.stringify(parsedArguments, null, 2);
  }, [parsedArguments]);

  // Memoize output text to avoid re-processing
  const outputText = useMemo(() => {
    if (!toolCall.output) return '';
    return typeof toolCall.output === 'string'
      ? toolCall.output
      : toolCall.output.output || JSON.stringify(toolCall.output, null, 2);
  }, [toolCall.output]);

  // Check if output is large and needs truncation
  const isLargeOutput = outputText.length > 2000;
  const maxLines = 50;
  
  // Memoize truncated output
  const displayOutput = useMemo(() => {
    if (!isLargeOutput || showFullOutput) return outputText;
    
    const lines = outputText.split('\n');
    if (lines.length <= maxLines) return outputText;
    
    return lines.slice(0, maxLines).join('\n') + '\n... (truncated)';
  }, [outputText, isLargeOutput, showFullOutput, maxLines]);

  // Custom styles for syntax highlighter
  const customStyle = {
    backgroundColor: 'transparent',
    margin: 0,
    padding: '0.2rem 0.5rem',
    fontSize: '0.75rem',
    color: theme === "dark" ? "#f2f2f2CC" : "#000000"
  };

  const getToolIcon = (toolName: string) => {
    return <Wrench className="h-3 w-3" />;
  };

  const handleCopyOutput = async () => {
    if (!outputText) return;
    
    try {
      await navigator.clipboard.writeText(outputText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  if (!toolCall.tool) {
    return <></>;
  }

  return (
    <div className="border border-gray-400/20 dark:border-gray-800/50 rounded-md mb-3 overflow-hidden">
      {/* Accordion header */}
      <div
        className={`flex items-center justify-between px-2 py-1 cursor-pointer ${
          toolCall.isPending 
            ? 'bg-yellow-100 dark:bg-yellow-900/20' 
            : 'bg-gray-200 dark:bg-transparent'
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-1">
          {getToolIcon(toolCall.tool)}
          <span className="text-sm space-x-1 flex items-center">
            <span>
              {toolCall.tool}
            </span>
            {!toolCall.isPending && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-green-500/40 dark:bg-green-400/10 text-green-800 dark:text-green-400">
                Completed
              </span>
            )}
          </span>
        </div>
        <div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </div>
      </div>

      {/* Accordion content */}
      {isOpen && (
        <div className="bg-gray-100 dark:bg-transparent">
          {/* Parameters section */}
          {formattedArguments && (
            <div className="p-2 space-y-1">
              <h4 className="text-xs uppercase text-gray-500 dark:text-gray-400">
                Parameters
              </h4>
              <div className="bg-gray-300/50 dark:bg-gray-800/50 rounded-md overflow-x-auto">
                <SyntaxHighlighter
                  language="json"
                  style={oneDark}
                  customStyle={customStyle}
                  wrapLines={true}
                  codeTagProps={{
                    style: {
                      fontSize: '0.75rem',
                      fontFamily: 'Monaco, Menlo, monospace',
                    }
                  }}
                >
                  {formattedArguments}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {/* Output section */}
          {toolCall.output && !toolCall.isPending && (
            <div className="p-2 pt-0 space-y-1">
              <div className="flex items-center justify-between">
                <h4 className="text-xs uppercase text-gray-500 dark:text-gray-400">
                  Output {isLargeOutput && (
                    <span className="text-xs text-gray-400">
                      ({outputText.split('\n').length} lines)
                    </span>
                  )}
                </h4>
                <div className="flex items-center gap-1">
                  {isLargeOutput && (
                    <button
                      onClick={() => setShowFullOutput(!showFullOutput)}
                      className="p-1 rounded hover:bg-gray-300/50 dark:hover:bg-gray-700/50 transition-colors text-xs"
                      title={showFullOutput ? "Show less" : "Show more"}
                    >
                      {showFullOutput ? "Show less" : "Show more"}
                    </button>
                  )}
                  <button
                    onClick={handleCopyOutput}
                    className="p-1 rounded hover:bg-gray-300/50 dark:hover:bg-gray-700/50 transition-colors"
                    title="Copy output"
                  >
                    {isCopied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
              <div className="bg-gray-300/50 dark:bg-gray-800/50 rounded-md overflow-x-auto">
                <SyntaxHighlighter
                  language="bash"
                  style={oneDark}
                  customStyle={customStyle}
                  wrapLines={true}
                  codeTagProps={{
                    style: {
                      fontSize: '0.75rem',
                      fontFamily: 'Monaco, Menlo, monospace',
                    }
                  }}
                >
                  {displayOutput}
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default React.memo(ToolCallAccordion, (prevProps, nextProps) => {
  return (
    prevProps.toolCall.tool === nextProps.toolCall.tool &&
    prevProps.toolCall.name === nextProps.toolCall.name &&
    prevProps.toolCall.arguments === nextProps.toolCall.arguments &&
    prevProps.toolCall.output === nextProps.toolCall.output &&
    prevProps.toolCall.isPending === nextProps.toolCall.isPending
  );
});