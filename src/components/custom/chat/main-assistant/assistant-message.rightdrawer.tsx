import React, { useState, useMemo } from 'react';
import { Copy, CheckCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './codeblock.righdrawer';
import ToolCallAccordion from '@/components/ui/toolcall';
import TodoList from './todolist.component';
import { ToolCall, TodoItem } from '@/api/orchestrator.chat';
import { openExternalUrl } from '@/api/external';
import { LinkPreview } from '@/components/ui/link-preview';
import ResponseFeedback from '../../responsefeedback/responsefeedback.component';
import { ChartLineDotsColors, ChartBarStacked, ChartBarLabelCustom, ChartNetworkTrafficStep, ChartCryptoPortfolio } from '@/components/custom/promgraphcontainer/graphs.component';
import { AgentkubeBot } from '@/assets/icons';
import { ComponentMap } from '@/components/custom/genui/components';

// Define todo tool names that should be rendered as TodoList instead of ToolCallAccordion
// Includes both the agent tools (todo_*) and planning tools (write_todos, read_todos)
const TODO_TOOLS = ['todo_write', 'todo_read', 'todo_update', 'todo_delete', 'todo_clear', 'write_todos', 'read_todos'];

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
  todos?: TodoItem[]; // OpenCode-style todos passed from parent
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ content, events = [], onRetry, userMessage, isStreaming = false, todos = [] }) => {
  // Use todos from props (passed from parent) OR try to extract from events
  const aggregatedTodos = useMemo(() => {
    // If todos are passed from parent, use them directly - this is the reliable path
    if (todos && todos.length > 0) {
      return todos;
    }

    // Try to extract from plan_created or plan_updated events first
    const planEvent = events.find(e => e.type === 'plan_created' || e.type === 'plan_updated');
    if (planEvent && planEvent.data.todos && Array.isArray(planEvent.data.todos)) {
      // Convert to TodoItem format (planning tools use different structure)
      return planEvent.data.todos.map((t: any, index: number) => ({
        id: t.id || `todo-${index}`,
        content: t.content,
        status: t.status || 'pending',
        priority: t.priority
      }));
    }

    // Otherwise try to extract from tool_end events (fallback)
    const todoMap = new Map<string, TodoItem>();

    events.forEach(event => {
      // Handle tool_end events for todo tools
      if (event.type === 'tool_end' && TODO_TOOLS.includes(event.data.tool)) {
        try {
          const result = typeof event.data.result === 'string'
            ? JSON.parse(event.data.result)
            : event.data.result;

          if (event.data.tool === 'todo_write' && result.todo) {
            const todo: TodoItem = {
              id: result.todo.id,
              content: result.todo.content,
              status: result.todo.status || 'pending',
              priority: result.todo.priority
            };
            todoMap.set(todo.id, todo);
          } else if (event.data.tool === 'todo_update' && result.todo) {
            const existingTodo = todoMap.get(result.todo.id);
            if (existingTodo) {
              existingTodo.status = result.todo.status;
            } else {
              todoMap.set(result.todo.id, {
                id: result.todo.id,
                content: result.todo.content,
                status: result.todo.status,
                priority: result.todo.priority
              });
            }
          } else if (event.data.tool === 'todo_read' && result.todos) {
            // Full todo list from read
            result.todos.forEach((t: any) => {
              todoMap.set(t.id, {
                id: t.id,
                content: t.content,
                status: t.status || 'pending',
                priority: t.priority
              });
            });
          } else if (event.data.tool === 'write_todos' && result.success) {
            // Handle write_todos from planning module - todos are in result
            // but we need to parse them from the raw response
          }
        } catch (e) {
          console.log('Failed to parse todo result:', e);
        }
      }
    });

    return Array.from(todoMap.values());
  }, [events, todos]);

  // Find the position for the TodoList (first todo tool position)
  const todoListPosition = useMemo(() => {
    for (const event of events) {
      if (event.type === 'tool_start' && TODO_TOOLS.includes(event.data.tool)) {
        return event.textPosition ?? 0;
      }
    }
    return -1; // No todo tools
  }, [events]);

  // Create sequential content by interleaving text and tool events in chronological order
  const sequentialContent = useMemo(() => {
    if (!events || events.length === 0) {
      // No events, just render content as is
      return [{ type: 'text' as const, content }];
    }

    // Sort all events by timestamp to get chronological order
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    // Group tool events by call_id
    const toolGroups = new Map<string, {
      events: StreamEvent[];
      isTodoTool: boolean;
      toolName?: string;
      startIndex: number; // Index in sorted events when this tool started
    }>();
    const customComponents = new Map<string, StreamEvent>();

    sortedEvents.forEach((event, index) => {
      if (event.type.startsWith('tool_')) {
        const callId = event.data.callId;
        const toolName = event.data.tool;

        if (!toolGroups.has(callId)) {
          toolGroups.set(callId, {
            events: [],
            isTodoTool: toolName ? TODO_TOOLS.includes(toolName) : false,
            toolName,
            startIndex: index
          });
        } else if (toolName && !toolGroups.get(callId)!.toolName) {
          // Update toolName and isTodoTool if we found the name from a later event
          const group = toolGroups.get(callId)!;
          group.toolName = toolName;
          group.isTodoTool = TODO_TOOLS.includes(toolName);
        }
        toolGroups.get(callId)!.events.push(event);
      } else if (event.type === 'custom_component') {
        const callId = event.data.call_id || event.data.callId;
        customComponents.set(callId, event);
      }
    });

    // Create a list of all tool calls with their chronological order
    const toolCallsInOrder: Array<{
      callId: string;
      events: StreamEvent[];
      isTodoTool: boolean;
      textPositionAtStart: number; // Text position when this tool started
    }> = [];

    // Get unique tool call IDs in order they first appeared
    const seenCallIds = new Set<string>();
    sortedEvents.forEach(event => {
      if (event.type === 'tool_start') {
        const callId = event.data.callId;
        if (!seenCallIds.has(callId)) {
          seenCallIds.add(callId);
          const group = toolGroups.get(callId);
          if (group) {
            toolCallsInOrder.push({
              callId,
              events: group.events,
              isTodoTool: group.isTodoTool,
              textPositionAtStart: event.textPosition ?? 0
            });
          }
        }
      }
    });

    // Track if we've inserted the TodoList already
    let todoListInserted = false;

    // Build sequential items
    const items: Array<{
      type: 'text' | 'tool' | 'redirect' | 'custom_component' | 'todolist';
      content?: string;
      callId?: string;
      events?: StreamEvent[];
      newInstruction?: string;
      componentName?: string;
      componentProps?: any;
      todos?: TodoItem[];
    }> = [];

    let lastTextPosition = 0;

    // Process each tool call in chronological order
    toolCallsInOrder.forEach(({ callId, events: toolEvents, isTodoTool, textPositionAtStart }) => {
      // Add any text that was generated before this tool call started
      if (textPositionAtStart > lastTextPosition) {
        const textChunk = content.substring(lastTextPosition, textPositionAtStart);
        if (textChunk.trim()) {
          items.push({ type: 'text', content: textChunk });
        }
        lastTextPosition = textPositionAtStart;
      }

      // Find redirect event if any
      const redirectEvent = toolEvents.find(e => e.type === 'tool_redirected');

      // If this is a todo tool, insert TodoList once
      if (isTodoTool) {
        if (!todoListInserted && aggregatedTodos.length > 0) {
          items.push({ type: 'todolist', todos: aggregatedTodos });
          todoListInserted = true;
        }
      } else {
        // Check if there's a custom component for this tool call
        const customComp = customComponents.get(callId);

        if (customComp) {
          // If there's a custom component, show it directly (skip ToolCallAccordion)
          items.push({
            type: 'custom_component',
            callId,
            componentName: customComp.data.component,
            componentProps: customComp.data.props
          });
        } else {
          // Otherwise show the standard tool call accordion
          items.push({ type: 'tool', callId, events: toolEvents });
        }

        // Add redirect instruction immediately after redirected tool
        if (redirectEvent) {
          items.push({ type: 'redirect', newInstruction: redirectEvent.data.newInstruction });
        }
      }

      // Update lastTextPosition to the end position of the tool (if we have it from tool_end)
      const endEvent = toolEvents.find(e => e.type === 'tool_end');
      if (endEvent && endEvent.textPosition !== undefined) {
        lastTextPosition = Math.max(lastTextPosition, endEvent.textPosition);
      }
    });

    // Add remaining text after all tool calls
    if (lastTextPosition < content.length) {
      const remainingText = content.substring(lastTextPosition);
      if (remainingText.trim()) {
        items.push({ type: 'text', content: remainingText });
      }
    }

    // If there are no items yet (e.g., only tool calls with no text), add the full content
    if (items.length === 0 && content.trim()) {
      items.push({ type: 'text', content });
    }

    // If there are todos but we haven't inserted the list yet, add at end
    if (!todoListInserted && aggregatedTodos.length > 0) {
      items.push({ type: 'todolist', todos: aggregatedTodos });
    }

    return items;
  }, [content, events, aggregatedTodos]);

  return (
    <div className="w-full relative">
      <div className=" p-3 text-foreground w-full px-4">
        <div className="flex items-start">
          <div className="bg-muted/60 w-7 h-7 rounded-md overflow-hidden flex items-center justify-center mr-2 text-green-400 mt-1">
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
              } else if (item.type === 'todolist' && item.todos && item.todos.length > 0) {
                // Render OpenCode-style TodoList component
                // return <TodoList key={`todolist-${index}`} todos={item.todos} />;
                return <></>;
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