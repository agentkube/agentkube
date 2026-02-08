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

  // Memoize parsed arguments object
  const parsedArguments = useMemo(() => {
    if (!toolCall.arguments) return null;

    // If arguments is already an object, return it
    if (typeof toolCall.arguments === 'object') {
      return toolCall.arguments as Record<string, unknown>;
    }

    // If it's a string, try to parse it
    try {
      return JSON.parse(toolCall.arguments) as Record<string, unknown>;
    } catch (error) {
      return null;
    }
  }, [toolCall.arguments]);

  // Memoize formatted arguments string
  const formattedArguments = useMemo(() => {
    if (!toolCall.arguments) return '';

    // If arguments is already an object, stringify it
    if (typeof toolCall.arguments === 'object') {
      return JSON.stringify(toolCall.arguments, null, 2);
    }

    // If it's a string, try to parse and re-stringify for formatting
    try {
      const parsed = JSON.parse(toolCall.arguments);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      // If parsing fails, return as-is
      return String(toolCall.arguments);
    }
  }, [toolCall.arguments]);

  // Extract command for shell to display in header
  const bashCommand = useMemo(() => {
    if (toolCall.tool !== 'shell' || !parsedArguments) return null;
    const command = parsedArguments.command;
    if (typeof command === 'string') {
      // Truncate if too long for header display
      return command.length > 60 ? command.substring(0, 60) + '...' : command;
    }
    return null;
  }, [toolCall.tool, parsedArguments]);

  // Helper function to extract 'output' field from Python dict string using regex
  const extractOutputFromPythonDict = (str: string): string | null => {
    // Match 'output': '...' pattern, handling escaped quotes and multiline content
    // This regex looks for 'output': ' and captures everything until the closing quote
    // that's followed by a comma and another key, or the end of the dict

    // First, try to find the output field start position
    const outputKeyMatch = str.match(/'output':\s*'/);
    if (!outputKeyMatch || outputKeyMatch.index === undefined) {
      return null;
    }

    const startIndex = outputKeyMatch.index + outputKeyMatch[0].length;

    // Now we need to find the matching closing quote
    // The closing quote should be followed by , ' (next key) or } (end of dict)
    let depth = 0;
    let endIndex = startIndex;
    let foundEnd = false;

    for (let i = startIndex; i < str.length; i++) {
      const char = str[i];
      const prevChar = i > 0 ? str[i - 1] : '';

      // Skip escaped characters
      if (prevChar === '\\') {
        continue;
      }

      // Check if this is the closing quote
      if (char === "'") {
        // Check what comes after (skip whitespace)
        let nextNonWhitespace = '';
        for (let j = i + 1; j < str.length; j++) {
          if (str[j] !== ' ' && str[j] !== '\n' && str[j] !== '\r' && str[j] !== '\t') {
            nextNonWhitespace = str[j];
            break;
          }
        }

        // Valid end: followed by , or }
        if (nextNonWhitespace === ',' || nextNonWhitespace === '}') {
          endIndex = i;
          foundEnd = true;
          break;
        }
      }
    }

    if (foundEnd) {
      return str.substring(startIndex, endIndex);
    }

    return null;
  };

  // Memoize output text to avoid re-processing
  const outputText = useMemo(() => {
    if (!toolCall.output) return '';

    // Helper to process string output and fix newlines
    const processStringOutput = (str: string): string => {
      // Handle literal \n characters if they exist
      if (str.includes('\\n')) {
        try {
          return str.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        } catch (e) {
          return str;
        }
      }
      return str;
    };

    let outputData = toolCall.output;

    // If output is a string, try to parse it as JSON first
    if (typeof outputData === 'string') {
      const originalString = outputData;

      try {
        // Try to parse as JSON (handles proper JSON format)
        outputData = JSON.parse(outputData);
      } catch (e) {
        // JSON parsing failed, try alternative approaches

        // Approach 1: Try to extract 'output' field directly using regex
        // This works for Python dict format like: {'success': True, 'output': '...'}
        const extractedOutput = extractOutputFromPythonDict(originalString);
        if (extractedOutput !== null) {
          // Successfully extracted the output field
          return processStringOutput(extractedOutput);
        }

        // Approach 2: Try simple quote replacement for simpler cases
        try {
          // Handle Python dict format: {'key': 'value'}
          // Only do this if the string looks like a Python dict
          if (originalString.trim().startsWith('{') && originalString.trim().endsWith('}')) {
            const jsonLikeString = originalString
              .replace(/'/g, '"')
              .replace(/True/g, 'true')
              .replace(/False/g, 'false')
              .replace(/None/g, 'null');
            outputData = JSON.parse(jsonLikeString);
          } else {
            // Not a dict-like structure, return as-is
            return processStringOutput(originalString);
          }
        } catch (e2) {
          // All parsing failed, return as-is
          return processStringOutput(originalString);
        }
      }
    }

    // Now outputData should be an object - extract the 'output' field if it exists
    if (typeof outputData === 'object' && outputData !== null) {
      // For shell and similar - extract 'output' field
      if ('output' in outputData && typeof outputData.output === 'string') {
        return processStringOutput(outputData.output);
      }

      // For kubectl_tool - check for 'stdout' field (legacy)
      if ('stdout' in outputData && typeof outputData.stdout === 'string') {
        const stderr = outputData.stderr || '';
        return processStringOutput(outputData.stdout + (stderr ? '\n' + stderr : ''));
      }

      // For error responses, show the error message
      if ('error' in outputData && typeof outputData.error === 'string') {
        return `Error: ${processStringOutput(outputData.error)}`;
      }

      // For helm and other tools with 'output' key
      if ('output' in outputData) {
        return processStringOutput(String(outputData.output));
      }

      // Fallback: stringify the object in a readable way
      return JSON.stringify(outputData, null, 2);
    }

    // Fallback: return as string
    return processStringOutput(String(outputData));
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
    <div className="border border-border rounded-md mb-3 overflow-hidden">
      {/* Accordion header */}
      <div
        className={`flex items-center justify-between px-2 py-1 cursor-pointer ${toolCall.isPending} 
            : 'bg-secondary'
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-1">
          {getToolIcon(toolCall.tool)}
          <span className="space-x-1 flex items-center">
            <span>
              {toolCall.tool}
            </span>
            {bashCommand && (
              <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[300px]">
                $ {bashCommand}
              </code>
            )}
            {/* {!toolCall.isPending && (
              <span className="text-xs px-1.5 py-0.5 rounded-md bg-green-500/40 dark:bg-green-400/10 text-green-800 dark:text-green-400">
                Completed
              </span>
            )} */}
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
      {
        isOpen && (
          <div className="bg-muted">
            {/* Parameters section */}
            {formattedArguments && (
              <div className="p-2 space-y-1">
                <h4 className="text-xs uppercase text-muted-foreground">
                  Parameters
                </h4>
                <div className="bg-muted/50 rounded-md overflow-x-auto">
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
                  <h4 className="text-xs uppercase text-muted-foreground">
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
                        className="p-1 rounded hover:bg-muted/50 transition-colors text-xs"
                        title={showFullOutput ? "Show less" : "Show more"}
                      >
                        {showFullOutput ? "Show less" : "Show more"}
                      </button>
                    )}
                    <button
                      onClick={handleCopyOutput}
                      className="p-1 rounded hover:bg-muted/50 transition-colors"
                      title="Copy output"
                    >
                      {isCopied ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-md overflow-x-auto">
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
            )
            }
          </div >
        )
      }
    </div >
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