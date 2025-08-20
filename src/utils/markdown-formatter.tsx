import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, CheckCheck, Sparkles } from 'lucide-react';
import { 
  ChartLineDotsColors,
  ChartBarStacked,
  ChartBarLabelCustom,
  ChartNetworkTrafficStep,
  ChartServiceHealthRadar,
  ChartStorageUtilizationRadial,
  ChartCryptoPortfolio
} from '@/components/custom/promgraphcontainer/graphs.component';
import { CodeBlock } from '@/components/custom/backgroundtask/codeblock.component';
import rehypeRaw from 'rehype-raw';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface TableProps {
  children?: React.ReactNode;
}

interface MarkdownContentProps {
  content: string | null | undefined;
}

// Chart component mapper
const ChartComponents = {
  'line-dots': ChartLineDotsColors,
  'bar-stacked': ChartBarStacked,
  'bar-label': ChartBarLabelCustom,
  'area-step': ChartNetworkTrafficStep,
  'radar': ChartServiceHealthRadar,
  'radial': ChartStorageUtilizationRadial,
  'crypto': ChartCryptoPortfolio,
};

// Custom component to handle chart rendering
const ChartRenderer = ({ type, title, description, explanation, ...props }: any) => {
  const ChartComponent = ChartComponents[type as keyof typeof ChartComponents];
  
  if (!ChartComponent) {
    return (
      <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 my-4">
        <p className="text-gray-500 dark:text-gray-400">Chart type "{type}" not found</p>
      </div>
    );
  }
  
  return (
    <div className="my-6 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {/* Chart on the left */}
      <div className="w-full">
        <ChartComponent 
          title={title}
          description={description}
          {...props}
        />
      </div>
      
      {/* Explanation on the right */}
      {explanation && (
        <div className="space-y-3 p-4 bg-transparent dark:bg-gray-800/20 rounded-lg border border-gray-200 dark:border-gray-700/30">
          <div className='font-semibold text-sm flex items-center gap-2 text-blue-700 dark:text-emerald-500'>
          <Sparkles className='h-4 w-4'/>
          <h4>
            Explanation
          </h4>
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <MarkdownContent content={explanation} />
          </div>
        </div>
      )}
    </div>
  );
};

const MarkdownContent = ({ content }: MarkdownContentProps) => {
  if (!content || typeof content !== 'string') {
    return <span className="text-gray-500 dark:text-gray-400 text-sm">No content available</span>;
  }
  
  const processedContent = content.replace(/\\n/g, '\n');

  // Custom renderer for handling chart components
  const components = {
    h1: ({ children }: any) => (
      <h1 className="text-2xl font-bold mt-6 mb-4">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-md font-medium mt-5 mb-2">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="text-xs font-bold mt-4 mb-2">{children}</h3>
    ),
    p: ({ children }: any) => {
      const childString = String(children);
      
      if (childString.includes('<chart>') && childString.includes('</chart>')) {
        const chartContent = childString.match(/<chart>(.*?)<\/chart>/);
        
        if (chartContent) {
          const content = chartContent[1];
          const typeMatch = content.match(/type:\s*([^\s]+)/);
          const titleMatch = content.match(/title:\s*([^:]*?)(?:\s+description:|$)/);
          const descMatch = content.match(/description:\s*([^:]*?)(?:\s+explanation:|$)/);
          const explanationMatch = content.match(/explanation:\s*(.+)$/);
          
          if (typeMatch) {
            return (
              <div className="my-4">
                <ChartRenderer 
                  type={typeMatch[1].trim()}
                  title={titleMatch ? titleMatch[1].trim() : 'Chart'}
                  description={descMatch ? descMatch[1].trim() : 'Chart description'}
                  explanation={explanationMatch ? explanationMatch[1].trim() : null}
                />
              </div>
            );
          }
        }
      }
      
      return <p className="text-xs text-gray-700 dark:text-gray-300 mb-4">{children}</p>;
    },
    ul: ({ children }: any) => (
      <ul className="list-disc list-outside space-y-2 mb-4 ml-4">{children}</ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal list-outside space-y-2 mb-4 ml-4 pl-6">{children}</ol>
    ),
    li: ({ children }: any) => (
      <li className="text-gray-700 dark:text-gray-300">{children}</li>
    ),
    table: ({ children }: TableProps) => (
      <div className="overflow-x-auto my-4 rounded-md">
        <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-800/60 rounded-xl border border-gray-300 dark:border-gray-900">
          {children}
        </table>
      </div>
    ),
    Chart: ({ type, title, description, ...props }: any) => {
      return (
        <div className="my-4">
          <ChartRenderer 
            type={type}
            title={title || 'Chart'}
            description={description || 'Chart description'}
            {...props}
          />
        </div>
      );
    },
    thead: ({ children }: any) => (
      <thead className="bg-gray-200 dark:bg-gray-800/30">{children}</thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-gray-300 dark:divide-gray-800 rounded-xl">{children}</tbody>
    ),
    tr: ({ children }: any) => (
      <tr className='hover:bg-gray-200 dark:hover:bg-gray-800/50 cursor-pointer'>{children}</tr>
    ),
    th: ({ children }: any) => (
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
    a: ({ href, children }: any) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
      >
        {children}
      </a>
    ),
    div: ({ children }: any) => {
      const childString = String(children);
      
      if (childString.includes('<chart>') && childString.includes('</chart>')) {
        const chartContent = childString.match(/<chart>([\s\S]*?)<\/chart>/);
        
        if (chartContent) {
          const content = chartContent[1];
          const typeMatch = content.match(/type:\s*([^\n]+)/);
          const titleMatch = content.match(/title:\s*([^\n]+)/);
          const descMatch = content.match(/description:\s*([^\n]+)/);
          
          if (typeMatch) {
            return (
              <div className="my-4">
                <ChartRenderer 
                  type={typeMatch[1].trim()}
                  title={titleMatch ? titleMatch[1].trim() : 'Chart'}
                  description={descMatch ? descMatch[1].trim() : 'Chart description'}
                />
              </div>
            );
          }
        }
      }
      
      return <div>{children}</div>;
    },
    
    code: ({ inline, children, className }: CodeProps) => {
      if (inline) {
        return <code className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono">{children}</code>;
      }
    
      const content = String(children);
      if (!content.includes('\n')) {
        return <code className="bg-gray-200 dark:bg-gray-800/80 text-gray-900 dark:text-green-400 px-1 py-0.5 rounded text-xs font-mono">{content}</code>;
      }
    
      const language = className?.replace('language-', '') || 'plaintext';
      
      return <CodeBlock language={language} content={content.trim()} />;
    },
    pre: ({ children }: any) => (
      <div className="my-4">{children}</div>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-gray-400 dark:border-gray-600 pl-4 py-2 my-4 text-gray-700 dark:text-gray-300 italic">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-6 border-t border-gray-300 dark:border-gray-700" />
    ),

  };

  return (
    <div className="text-gray-800 dark:text-gray-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // rehypePlugins={[rehypeRaw]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;