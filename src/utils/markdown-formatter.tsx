import React from 'react';
import ReactMarkdown from 'react-markdown';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface MarkdownContentProps {
  content: string;
}

const MarkdownContent = ({ content }: MarkdownContentProps) => {
  // Process the content to convert \n to actual newlines
  const processedContent = content.replace(/\\n/g, '\n');

  return (
    <div className="flex flex-col space-y-4 rounded-xl text-gray-800">
      <ReactMarkdown
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
            <p className="text-gray-700 mb-4 whitespace-pre-line">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-2 mb-4 ml-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-2 mb-4 ml-4">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-gray-700">{children}</li>
          ),
          code: ({ inline, children, className }: CodeProps) => {
            if (inline) {
              return <code className="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
            }

            const content = String(children);
            if (!content.includes('\n')) {
              return <code className="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono">{content}</code>;
            }

            // For multiline code blocks, apply basic styling
            return (
              <pre className={`bg-gray-100 p-4 rounded-lg overflow-x-auto ${className}`}>
                <code className="text-sm font-mono whitespace-pre-line">{content}</code>
              </pre>
            );
          },
          pre: ({ children }) => (
            <div className="my-4">{children}</div>
          )
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownContent;