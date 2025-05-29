import React, { useRef, useState, useEffect } from 'react';
import { Sparkles, Copy, ThumbsUp, ThumbsDown, Check, ChevronDown, ChevronUp, Braces } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './codeblock.component';
import ToolCallAccordion from './tool-call.component';
import { ToolCall } from '@/api/orchestrator.chat';
import { openExternalUrl } from '@/api/external';
import { LinkPreview } from '@/components/ui/link-preview';
import ToolParameter from './toolparameter.component';

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
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showJsonData, setShowJsonData] = useState(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const dislikeButtonRef = useRef<HTMLButtonElement>(null);

  // Extract JSON objects and actual content
  const extractJsonObjects = (text: string) => {
    try {
      const jsonObjects: string[] = [];
      let remainingText = text;
      
      // Regular expression to match a JSON object
      const jsonObjectRegex = /^\{.*?\}/s;
      
      let match = remainingText.match(jsonObjectRegex);
      while (match && match[0]) {
        jsonObjects.push(match[0]);
        remainingText = remainingText.substring(match[0].length);
        match = remainingText.match(jsonObjectRegex);
      }
      
      return {
        jsonObjects: jsonObjects.length > 0 ? jsonObjects : null,
        remainingContent: remainingText
      };
    } catch (e) {
      return { jsonObjects: null, remainingContent: text };
    }
  };
  
  const { jsonObjects, remainingContent } = extractJsonObjects(content);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(remainingContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Handle feedback
  const handleLike = () => {
    setLiked(!liked);
    if (disliked) setDisliked(false);
    //TODO Here you could add API call to save feedback
  };

  const handleDislike = () => {
    setDisliked(!disliked);
    if (liked) setLiked(false);
    setShowFeedback(!disliked); 
    //TODO Here you could add API call to save feedback
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (feedbackRef.current &&
        !feedbackRef.current.contains(event.target as Node) &&
        dislikeButtonRef.current &&
        !dislikeButtonRef.current.contains(event.target as Node)) {
        setShowFeedback(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

            {/* Display JSON data in an accordion if it exists */}
            {jsonObjects && jsonObjects.length > 0 && (
              <ToolParameter jsonObjects={jsonObjects} />
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
              {remainingContent}
            </ReactMarkdown>

            {/* Feedback icons at bottom right */}
            <div className="flex items-center justify-end mt-2 space-x-1">
              {showFeedback && (
                <div
                  ref={feedbackRef}
                  className="absolute bottom-10 right-5 w-72 bg-gray-100 dark:bg-[#0F121B] rounded-lg shadow-lg border dark:border-gray-800 text-sm z-10">
                  <textarea
                    className="w-full p-2 bg-gray-300/70 dark:bg-gray-800/40 backdrop-blur-md  rounded-t-lg text-gray-800 dark:text-gray-300 text-sm resize-none"
                    placeholder="Tell us what you liked about the response or how it could be improved."
                    rows={3}
                  />
                  <div className="flex justify-between items-end px-3 pb-2">
                    <p className="text-xs text-gray-500">
                      This will share your feedback and all content from the current chat, which Agentkube may use to help improve. <a onClick={() => openExternalUrl("https://agentkube.com")} className="text-blue-400 hover:underline">Learn more</a>.
                    </p>
                    <button
                      className="ml-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs font-medium"
                      onClick={() => setShowFeedback(false)}
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={copyToClipboard}
                className="p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                title="Copy message"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-500 dark:text-gray-600" />
                )}
              </button>

              <button
                onClick={handleLike}
                className={`p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${liked ? 'text-green-500' : 'text-gray-500 dark:text-gray-600'
                  }`}
                title="Like"
              >
                <ThumbsUp className="h-4 w-4" />
              </button>

              <button
                ref={dislikeButtonRef}
                onClick={handleDislike}
                className={`p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${disliked ? 'text-red-500' : 'text-gray-500 dark:text-gray-600'
                  }`}
                title="Dislike"
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantMessage;