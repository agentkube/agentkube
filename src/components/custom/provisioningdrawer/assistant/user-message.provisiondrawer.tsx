import { User } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { CodeProps } from "@/types/provision/chat";

export const UserMessage: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="flex items-start w-full px-4">
      <div className="w-8 h-4 rounded-full flex items-center justify-center overflow-hidden mr-2 mt-1">
        <User className="w-4 h-4" />
      </div>
      <div className="text-gray-800 dark:text-white w-full">
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className="text-sm text-gray-800 dark:text-white">{children}</p>
            ),
            code: ({ inline, children }: CodeProps) => {
              if (inline) {
                return <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
              }
              return <code className="bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
};