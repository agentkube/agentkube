import React from 'react';
import { Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './codeblock.righdrawer';
import ToolCallAccordion from '@/components/ui/toolcall';
import { ToolCall } from '@/api/orchestrator.chat';
import { openExternalUrl } from '@/api/external';
import { LinkPreview } from '@/components/ui/link-preview';
import ToolParameter from './toolparameter.rightdrawer';
import ResponseFeedback from '../../responsefeedback/responsefeedback.component';
import { ChartLineDotsColors, ChartBarStacked, ChartBarLabelCustom, ChartNetworkTrafficStep, ChartCryptoPortfolio } from '@/components/custom/promgraphcontainer/graphs.component';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface TableProps {
  children?: React.ReactNode;
}

interface AssistantMessageProps {
  content: string;
  toolCalls?: ToolCall[];
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ content, toolCalls = [] }) => {
  return (
    <div className="w-full relative">
      <div className="bg-gray-300/30 dark:bg-gray-800/20 p-3 text-gray-800 dark:text-gray-300 w-full px-4">
        <div className="flex items-start">
          <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center mr-2 text-green-400 mt-1">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 overflow-auto">
            {/* Display tool calls if available */}
            {toolCalls.length > 0 && (
              <div className="mb-4">
                {toolCalls.map((toolCall, index) => (
                  <ToolCallAccordion key={index} toolCall={toolCall} />
                ))}
              </div>
            )}


            {/* Display the regular message content */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mt-6 mb-4">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mt-5 mb-3">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold mt-4 mb-2">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-gray-700 dark:text-gray-300 mb-4">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-2 mb-4 ml-4">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-2 mb-4 ml-4">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-gray-700 dark:text-gray-300">{children}</li>
                ),
                // Fixed table support
                table: ({ children }: TableProps) => (
                  <div className="overflow-x-auto my-4 rounded-md">
                    <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-800/60 rounded-xl border border-gray-300 dark:border-gray-900">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-gray-200 dark:bg-gray-900">{children}</thead>
                ),
                tbody: ({ children }) => (
                  <tbody className="divide-y divide-gray-300 dark:divide-gray-800 rounded-xl">{children}</tbody>
                ),
                tr: ({ children }) => (
                  <tr className='hover:bg-gray-200 dark:hover:bg-gray-800/50 cursor-pointer'>{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="px-4 py-2 text-left text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider border border-gray-300 dark:border-gray-800">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300  border border-gray-300 dark:border-gray-800">{children}</td>
                ),

                a: ({ href, children }) => (
                  <LinkPreview
                    url={href as string}
                    className='cursor-pointer'
                  >
                    <a
                      onClick={() => openExternalUrl(href as string)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {children}
                    </a>
                  </LinkPreview>
                ),
                code: ({ inline, children, className }: CodeProps) => {
                  // Handle inline code (single backticks)
                  if (inline) {
                    return <code className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
                  }

                  // Only process content that comes from triple backticks (non-inline code blocks)
                  const content = String(children);
                  if (!content.includes('\n')) {
                    return <code className="bg-gray-200 dark:bg-gray-800/80 text-green-400 px-1 py-0.5 rounded text-sm font-mono">{content}</code>;
                  }

                  const language = className?.replace('language-', '') || 'plaintext';
                  return <CodeBlock language={language} content={content.trim()} />;
                },
                pre: ({ children }) => (
                  <div className="my-4">{children}</div>
                ),
                // Add blockquote support
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-400 dark:border-gray-600 pl-4 py-2 my-4 text-gray-700 dark:text-gray-300 italic">
                    {children}
                  </blockquote>
                ),
                // Add horizontal rule
                hr: () => (
                  <hr className="my-6 border-t border-gray-300 dark:border-gray-700" />
                )
              }}
            >
              {content}
            </ReactMarkdown>

            {/* Always render a sample chart */}
            {/* <div className="p-0">
              {Math.random() > 0.66 ? <ChartLineDotsColors /> : 
               Math.random() > 0.5 ? <ChartBarStacked /> : 
               <ChartBarLabelCustom />}
            </div> */}
            <ChartNetworkTrafficStep />
            <ChartLineDotsColors />
            <ChartBarStacked />
            <ChartBarLabelCustom />
            <ChartCryptoPortfolio />
            {/* Use the new ResponseFeedback component */}
            <ResponseFeedback content={content} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantMessage;