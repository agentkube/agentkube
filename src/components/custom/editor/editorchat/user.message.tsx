import React from 'react';
import { User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from './codeblock.component';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface UserMessageProps {
  content: string;
}

const UserMessage: React.FC<UserMessageProps> = ({ content }) => {
  return (
    <div className="flex p-4 w-full">
      <div className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden mr-2">
        <User className="w-4 h-4" />
      </div>
      <div className="text-gray-800 dark:text-white w-full">
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
              <p className="text-gray-800 dark:text-white mb-4">{children}</p>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-2 mb-4 ml-4">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-2 mb-4 ml-4">{children}</ol>
            ),
            li: ({ children }) => (
              <li className="text-gray-800 dark:text-white">{children}</li>
            ),
            code: ({ inline, children, className }: CodeProps) => {
              // Handle inline code (single backticks)
              if (inline) {
                return <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
              }

              // Only process content that comes from triple backticks (non-inline code blocks)
              const content = String(children);
              if (!content.includes('\n')) {
                return <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">{content}</code>;
              }

              const language = className?.replace('language-', '') || 'yaml';
              return <CodeBlock language={language} content={content.trim()} />;
            },
            pre: ({ children }) => (
              <div className="my-4">{children}</div>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};

export default UserMessage;