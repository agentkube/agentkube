import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Wrench } from 'lucide-react';
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
  const { theme } = useTheme();

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

  if (!toolCall.tool) {
    return <></>;
  }

  return (
    <div className="border border-gray-400/20 dark:border-gray-800/50 rounded-md mb-3 overflow-hidden">
      {/* Accordion header */}
      <div
        className="flex items-center justify-between px-2 py-1 bg-gray-200 dark:bg-transparent cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-1">
          {getToolIcon(toolCall.tool)}
          <span className="text-sm">
            {toolCall.tool}
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
          {toolCall.arguments && (
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
                  {JSON.stringify(JSON.parse(toolCall.arguments), null, 2)}
                </SyntaxHighlighter>
              </div>
            </div>
          )}

          {/* Output section */}
          {toolCall.output && (
            <div className="p-2 pt-0 space-y-1">
              <h4 className="text-xs uppercase text-gray-500 dark:text-gray-400">
                Output
              </h4>
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
                  {typeof toolCall.output === 'string'
                    ? toolCall.output
                    : toolCall.output.output || JSON.stringify(toolCall.output, null, 2)
                  }
                </SyntaxHighlighter>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ToolCallAccordion;