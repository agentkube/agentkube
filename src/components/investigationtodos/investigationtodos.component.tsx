import React, { useState } from 'react';
import { Check, Loader2, ChevronDown, ChevronUp, ListTodo } from 'lucide-react';
import { TodoItem } from '@/hooks/useInvestigationStream';

// Re-export TodoItem for convenience
export type { TodoItem } from '@/hooks/useInvestigationStream';

interface InvestigationTodosProps {
  todos?: TodoItem[];
  title?: string;
  isStreaming?: boolean;
}

const InvestigationTodos: React.FC<InvestigationTodosProps> = ({
  todos = [],
  title = "Investigation Plan",
  isStreaming = false
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Don't render if no todos and not streaming
  if ((!todos || todos.length === 0) && !isStreaming) {
    return null;
  }

  // Count completed todos
  const completedCount = todos.filter(t => t.status === 'completed').length;
  const totalCount = todos.length;

  return (
    <div className="w-full">
      <div className="bg-card/30 rounded-lg border border-border/50 overflow-hidden">
        {/* Header - collapsible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground uppercase tracking-wide">
              {title}
            </span>
            <span className="text-xs text-muted-foreground ml-1">
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {/* Todo items */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-1 space-y-1">
            {todos.length === 0 && isStreaming ? (
              <div className="flex items-center gap-3 py-2 bg-muted/20 rounded-md px-2">
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                <span className="text-sm text-muted-foreground">Generating investigation plan...</span>
              </div>
            ) : (
              todos.map((todo, index) => (
                <div
                  key={todo.id || index}
                  className="flex items-start gap-3 py-2 bg-muted/20 rounded-md px-2 hover:bg-muted/40 transition-colors border border-transparent hover:border-border/50"
                >
                  {/* Checkbox/Status indicator */}
                  <div className="flex-shrink-0 mt-0.5">
                    {todo.status === 'completed' ? (
                      <div className="w-4 h-4 rounded border border-green-500/30 bg-green-500/10 flex items-center justify-center">
                        <Check className="w-3 h-3 text-green-500" strokeWidth={2.5} />
                      </div>
                    ) : todo.status === 'in_progress' ? (
                      <div className="w-4 h-4 rounded border border-blue-500/50 bg-blue-500/10 flex items-center justify-center">
                        <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />
                      </div>
                    ) : todo.status === 'cancelled' ? (
                      <div className="w-4 h-4 rounded border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                        <span className="text-xs text-red-500">×</span>
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded border border-muted-foreground/30 bg-transparent" />
                    )}
                  </div>

                  {/* Todo content */}
                  <span
                    className={`flex-1 text-sm leading-snug ${todo.status === 'completed'
                      ? 'text-muted-foreground'
                      : todo.status === 'cancelled'
                        ? 'text-muted-foreground line-through'
                        : todo.status === 'in_progress'
                          ? 'text-foreground'
                          : 'text-foreground/80'
                      }`}
                  >
                    {todo.content}
                  </span>

                  {/* Priority indicator (optional) */}
                  {todo.priority && todo.status !== 'completed' && todo.status !== 'cancelled' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider ${todo.priority === 'high'
                      ? 'bg-red-500/10 text-red-500'
                      : todo.priority === 'medium'
                        ? 'bg-yellow-500/10 text-yellow-500'
                        : 'bg-green-500/10 text-green-500'
                      }`}>
                      {todo.priority}
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InvestigationTodos;
