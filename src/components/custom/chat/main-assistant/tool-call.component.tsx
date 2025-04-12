import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { ToolCall } from '@/api/orchestrator.chat';
import { CodeBlock } from './codeblock.righdrawer';

interface ToolCallAccordionProps {
  toolCall: ToolCall;
}

const ToolCallAccordion: React.FC<ToolCallAccordionProps> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false);

  const formatCommand = () => {
    if (typeof toolCall.command === 'object') {
      // If command includes the actual command string
      if (toolCall.command.command) {
        return toolCall.command.command;
      }
      // Otherwise format as JSON
      return JSON.stringify(toolCall.command, null, 2);
    }
    return String(toolCall.command);
  };

  const getToolIcon = (toolName: string) => {
    // You can customize this based on the actual tool names you have
    return <Terminal className="h-3 w-3" />;
  };

  const getCommandText = () => {
    try {
      return JSON.stringify(toolCall.command, null, 2);
    } catch (e) {
      return String(toolCall.command);
    }
  };

  return (
    <div className="border border-gray-400 dark:border-gray-800/50 rounded-md mb-3 overflow-hidden">
      {/* Accordion header */}
      <div
        className="flex items-center justify-between px-2 py-1 bg-gray-200 dark:bg-gray-900 cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center space-x-2">
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
        <div className="bg-gray-100 dark:bg-gray-800/50">
          <div className="bg-gray-200 text-gray-600 dark:text-gray-500 bg-gray-300 dark:bg-gray-800/50 p-2 rounded text-sm font-mono">
            {formatCommand()}
          </div>

          {/* Output section */}
          <div>
            {/* <h4 className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">Output</h4> */}
            <div className="bg-gray-400 dark:bg-gray-900 p-3">
              <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 dark:text-gray-300">
                {/* <CodeBlock language="json" content={toolCall.output} /> */}
                {toolCall.output.length > 0 ? toolCall.output : 'No output'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolCallAccordion;