import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, CheckCheck } from 'lucide-react';
import { LinkPreview } from '@/components/ui/link-preview';
import { openExternalUrl } from '@/api/external';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface TableProps {
  children?: React.ReactNode;
}

interface MarkdownContentProps {
  content: string;
}

const MarkdownContent = ({ content }: MarkdownContentProps) => {
  const processedContent = content.replace(/\\n/g, '\n');

  return (
    <div className="text-gray-800 dark:text-gray-300">
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
            <ul className="list-disc list-outside space-y-2 mb-4 ml-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside space-y-2 mb-4 ml-4 pl-6">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-gray-700 dark:text-gray-300">{children}</li>
          ),
          table: ({ children }: TableProps) => (
            <div className="overflow-x-auto my-4 rounded-md">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-800/60 rounded-xl border border-gray-300 dark:border-gray-900">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-gray-200 dark:bg-gray-800/30">{children}</thead>
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
          td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { style?: React.CSSProperties & { '--rmd-table-cell-index'?: number } }) => {
            const [showCopy, setShowCopy] = useState(false);
            const [copied, setCopied] = useState(false);
            
            const isFirstColumn = props.style?.['--rmd-table-cell-index'] === 0 || 
                                 (!props.style && React.Children.toArray(children).length > 0);
            
            const handleCopy = async () => {
              const text = typeof children === 'string' ? children : 
                          React.Children.toArray(children).join('');
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            };
          
            return (
              <td 
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-800 relative group"
                onMouseEnter={() => isFirstColumn && setShowCopy(true)}
                onMouseLeave={() => setShowCopy(false)}
              >
                {children}
                {isFirstColumn && (showCopy || copied) && (
                  <button
                    onClick={handleCopy}
                    className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded transition-all duration-200 opacity-0 group-hover:opacity-100 ${
                      copied 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                        : 'bg-gray-100 dark:bg-transparent hover:bg-gray-200 dark:hover:bg-transparent'
                    }`}
                  >
                    {copied ? (
                      <CheckCheck className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                )}
              </td>
            );
          },
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
            if (inline) {
              return <code className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
            }

            const content = String(children);
            if (!content.includes('\n')) {
              return <code className="bg-gray-200 dark:bg-gray-800/80 text-green-400 px-1 py-0.5 rounded text-sm font-mono">{content}</code>;
            }

            const language = className?.replace('language-', '') || 'plaintext';
            return (
              <pre className={`bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-x-auto my-4 ${className}`}>
                <code className="text-sm font-mono whitespace-pre-line">{content}</code>
              </pre>
            );
          },
          pre: ({ children }) => (
            <div className="my-4">{children}</div>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-gray-400 dark:border-gray-600 pl-4 py-2 my-4 text-gray-700 dark:text-gray-300 italic">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-6 border-t border-gray-300 dark:border-gray-700" />
          )
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;