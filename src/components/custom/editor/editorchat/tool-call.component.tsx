import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal, Wrench } from 'lucide-react';
import { ToolCall } from '@/api/orchestrator.chat';
import { CodeBlock } from './codeblock.component';

interface ToolCallAccordionProps {
  toolCall: ToolCall;
}

const ToolCallAccordion: React.FC<ToolCallAccordionProps> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getToolIcon = (toolName: string) => {
    // You can customize this based on the actual tool names you have
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
           Tool call: {toolCall.tool}
          </div>

          {/* Output section */}
          <div>
            {/* <h4 className="text-xs uppercase text-gray-500 dark:text-gray-400 mb-1">Output</h4> */}
                {/* <CodeBlock language="json" content={toolCall.output} /> */}
            {/* <div className="bg-gray-400 dark:bg-gray-900 p-3">
              <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 dark:text-gray-300">
                {toolCall.output && toolCall.output.length > 0 ? toolCall.output : 'No output'}
              </pre>
            </div> */}
          </div>
        </div>
      )}
    </div>
  );
};

export default ToolCallAccordion;