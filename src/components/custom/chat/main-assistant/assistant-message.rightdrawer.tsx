import React, { useState, useMemo } from 'react';
import { Copy, CheckCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './codeblock.righdrawer';
import ToolCallAccordion from '@/components/ui/toolcall';
import { ToolCall } from '@/api/orchestrator.chat';
import { openExternalUrl } from '@/api/external';
import { LinkPreview } from '@/components/ui/link-preview';
import ResponseFeedback from '../../responsefeedback/responsefeedback.component';
import { ChartLineDotsColors, ChartBarStacked, ChartBarLabelCustom, ChartNetworkTrafficStep, ChartCryptoPortfolio } from '@/components/custom/promgraphcontainer/graphs.component';
import { AgentkubeBot } from '@/assets/icons';
import { ComponentMap } from '@/components/custom/genui/components';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface TableProps {
  children?: React.ReactNode;
}

// Define stream events to maintain proper order
interface StreamEvent {
  type: 'text' | 'reasoning' | 'tool_start' | 'tool_approval' | 'tool_approved' | 'tool_denied' | 'tool_redirected' | 'tool_end' | 'custom_component' | 'plan_created' | 'plan_updated';
  timestamp: number;
  textPosition?: number; // Position in text where this event occurred
  data: any;
}

interface AssistantMessageProps {
  content: string;
  events?: StreamEvent[];
  onRetry?: (userMessage: string) => void;
  userMessage?: string;
  isStreaming?: boolean;
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ content, events = [], onRetry, userMessage, isStreaming = false }) => {
  // Create sequential content by interleaving text and tool events based on textPosition
  const sequentialContent = useMemo(() => {
    if (!events || events.length === 0) {
      // No events, just render content as is
      return [{ type: 'text' as const, content }];
    }

    // Group tool events by call_id and find their text position
    const toolGroups = new Map<string, { position: number; events: StreamEvent[] }>();
    const customComponents = new Map<string, { position: number; event: StreamEvent }>();

    events.forEach(event => {
      if (event.type.startsWith('tool_')) {
        const callId = event.data.callId;
        if (!toolGroups.has(callId)) {
          toolGroups.set(callId, {
            position: event.textPosition ?? 0,
            events: []
          });
        }
        toolGroups.get(callId)!.events.push(event);
      } else if (event.type === 'custom_component') {
        const callId = event.data.call_id || event.data.callId;
        customComponents.set(callId, {
          position: event.textPosition ?? 0,
          event
        });
      }
    });

    // Create insertion points for tool calls
    const insertionPoints: Array<{ position: number; callId: string; events: StreamEvent[]; showRedirect?: { newInstruction: string } }> = [];
    toolGroups.forEach((group, callId) => {
      const redirectEvent = group.events.find(e => e.type === 'tool_redirected');

      insertionPoints.push({
        position: group.position,
        callId,
        events: group.events,
        showRedirect: redirectEvent ? { newInstruction: redirectEvent.data.newInstruction } : undefined
      });
    });

    // Sort by position
    insertionPoints.sort((a, b) => a.position - b.position);

    // Build sequential items
    const items: Array<{
      type: 'text' | 'tool' | 'redirect' | 'custom_component';
      content?: string;
      callId?: string;
      events?: StreamEvent[];
      newInstruction?: string;
      componentName?: string;
      componentProps?: any;
    }> = [];
    let lastPosition = 0;

    insertionPoints.forEach(({ position, callId, events, showRedirect }) => {
      // Add text before this tool call
      if (position > lastPosition) {
        const textChunk = content.substring(lastPosition, position);
        if (textChunk) {
          items.push({ type: 'text', content: textChunk });
        }
      }

      // Add tool call
      items.push({ type: 'tool', callId, events });

      // Check if there's a custom component for this tool call
      const customComp = customComponents.get(callId);
      if (customComp) {
        items.push({
          type: 'custom_component',
          callId,
          componentName: customComp.event.data.component,
          componentProps: customComp.event.data.props
        });
      }

      // Add redirect instruction immediately after redirected tool (only once)
      if (showRedirect) {
        items.push({ type: 'redirect', newInstruction: showRedirect.newInstruction });
      }

      lastPosition = position;
    });

    // Add remaining text after all tool calls
    if (lastPosition < content.length) {
      const remainingText = content.substring(lastPosition);
      if (remainingText) {
        items.push({ type: 'text', content: remainingText });
      }
    }

    return items;
  }, [content, events]);

  return (
    <div className="w-full relative">
      <div className="bg-muted/30 p-3 text-foreground w-full px-4">
        <div className="flex items-start">
          <div className="bg-muted/30 w-7 h-7 rounded-md overflow-hidden flex items-center justify-center mr-2 text-green-400 mt-1">
            <AgentkubeBot className="h-5 w-5" />
          </div>
          <div className="flex-1 overflow-auto py-1">
            {/* Render sequential content - text and tools interleaved */}
            {sequentialContent.map((item, index) => {
              if (item.type === 'text' && item.content) {
                return (
                  <ReactMarkdown
                    key={`text-${index}`}
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-2xl font-medium mt-6 mb-4">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-xl font-medium mt-5 mb-3">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-lg font-medium mt-4 mb-2">{children}</h3>
                      ),
                      p: ({ children }) => (
                        <p className="text-foreground mb-4">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-outside space-y-2 mb-4 ml-4">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-outside space-y-2 mb-4 ml-4 pl-6">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-foreground">{children}</li>
                      ),
                      // Fixed table support
                      table: ({ children }: TableProps) => (
                        <div className="overflow-x-auto my-4 rounded-md">
                          <table className="min-w-full divide-y divide-border rounded-xl border border-border">
                            {children}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-muted">{children}</thead>
                      ),
                      tbody: ({ children }) => (
                        <tbody className="divide-y divide-border rounded-xl">{children}</tbody>
                      ),
                      tr: ({ children }) => (
                        <tr className='hover:bg-accent-hover cursor-pointer'>{children}</tr>
                      ),
                      th: ({ children }) => (
                        <th className="px-4 py-2 text-left text-xs font-bold text-foreground uppercase tracking-wider border border-border">{children}</th>
                      ),
                      td: ({ children, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { style?: React.CSSProperties & { '--rmd-table-cell-index'?: number } }) => {
                        const [showCopy, setShowCopy] = useState(false);
                        const [copied, setCopied] = useState(false);

                        // Check if this is the first cell in the row
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
                            className="px-4 py-2 text-sm text-foreground border border-border relative group"
                            onMouseEnter={() => isFirstColumn && setShowCopy(true)}
                            onMouseLeave={() => setShowCopy(false)}
                          >
                            {children}
                            {isFirstColumn && (showCopy || copied) && (
                              <button
                                onClick={handleCopy}
                                className={`absolute right-2 top-1/2 transform -translate-y-1/2 p-1 rounded transition-all duration-200 opacity-0 group-hover:opacity-100 ${copied
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-secondary hover:bg-accent-hover'
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
                        // Handle inline code (single backticks)
                        if (inline) {
                          return <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
                        }

                        // Only process content that comes from triple backticks (non-inline code blocks)
                        const content = String(children);
                        if (!content.includes('\n')) {
                          return <code className="bg-muted text-green-400 px-1 py-0.5 rounded text-sm font-mono">{content}</code>;
                        }

                        const language = className?.replace('language-', '') || 'plaintext';
                        return <CodeBlock language={language} content={content.trim()} />;
                      },
                      pre: ({ children }) => (
                        <div className="my-4">{children}</div>
                      ),
                      // Add blockquote support
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-border pl-4 py-2 my-4 text-foreground italic">
                          {children}
                        </blockquote>
                      ),
                      // Add horizontal rule
                      hr: () => (
                        <hr className="my-6 border-t border-border" />
                      )
                    }}
                  >
                    {item.content}
                  </ReactMarkdown>
                );
              } else if (item.type === 'tool' && item.callId && item.events) {
                // Render tool call
                const toolStartEvent = item.events.find(e => e.type === 'tool_start');
                const toolEndEvent = item.events.find(e => e.type === 'tool_end');
                const approvalEvent = item.events.find(e => e.type === 'tool_approval');
                const redirectEvent = item.events.find(e => e.type === 'tool_redirected');

                if (!toolStartEvent) return null;

                // Parse the result - it comes as a string that needs to be parsed
                let parsedResult;
                try {
                  parsedResult = typeof toolEndEvent?.data.result === 'string'
                    ? JSON.parse(toolEndEvent.data.result.replace(/'/g, '"'))
                    : toolEndEvent?.data.result;
                } catch (e) {
                  parsedResult = toolEndEvent?.data.result;
                }

                const toolCall: ToolCall = {
                  tool: toolStartEvent.data.tool,
                  name: toolStartEvent.data.tool,
                  arguments: toolStartEvent.data.args,
                  call_id: item.callId,
                  isPending: !!approvalEvent && !toolEndEvent,
                  output: parsedResult,
                  success: toolEndEvent?.data.success
                };

                return <ToolCallAccordion key={`tool-${item.callId}`} toolCall={toolCall} />;
              } else if (item.type === 'custom_component' && item.componentName && item.componentProps) {
                // Render custom GenUI component
                const Component = ComponentMap[item.componentName as keyof typeof ComponentMap];
                if (Component) {
                  return (
                    <div key={`custom-${item.callId}-${index}`} className="my-2">
                      <Component {...item.componentProps} />
                    </div>
                  );
                }
                return null;
              } else if (item.type === 'redirect' && item.newInstruction) {
                // Render redirect instruction (only once, as a separate item)
                return (
                  <div key={`redirect-${index}`} className="text-sm text-orange-600 dark:text-orange-400 italic mb-3 pl-2 border-l-2 border-orange-400">
                    Redirected: {item.newInstruction}
                  </div>
                );
              }

              return null;
            })}

            {/* Always render a sample chart */}
            {/* <div className="p-0">
              {Math.random() > 0.66 ? <ChartLineDotsColors /> :
               Math.random() > 0.5 ? <ChartBarStacked /> :
               <ChartBarLabelCustom />}
            </div> */}
            {/*
            <ChartNetworkTrafficStep />
            <ChartLineDotsColors />
            <ChartBarStacked />
            <ChartBarLabelCustom />
            <ChartCryptoPortfolio />
            */}

            {/* Use the new ResponseFeedback component */}
            <ResponseFeedback
              content={content}
              onRetry={onRetry}
              userMessage={userMessage}
            />

            {/* Loading indicator - only show when streaming */}
            {isStreaming && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <div className="flex space-x-1">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span>Processing...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Memoize the component to prevent unnecessary re-renders
export default React.memo(AssistantMessage, (prevProps, nextProps) => {
  return (
    prevProps.content === nextProps.content &&
    prevProps.events === nextProps.events &&
    prevProps.userMessage === nextProps.userMessage &&
    prevProps.isStreaming === nextProps.isStreaming
  );
});