import React, { useState } from 'react';
import { Check, Circle, Loader2, ChevronDown, ChevronUp, ListTodo } from 'lucide-react';
import { TodoItem } from '@/api/orchestrator.chat';

interface TodoListProps {
  todos: TodoItem[];
  title?: string;
}

/**
 * OpenCode-style TodoList component
 * Renders todos as a collapsible checklist with status indicators
 * Matches the OpenCode desktop app design
 */
const TodoList: React.FC<TodoListProps> = ({ todos, title }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!todos || todos.length === 0) {
    return null;
  }

  // Count completed todos
  const completedCount = todos.filter(t => t.status === 'completed').length;
  const totalCount = todos.length;

  return (
    <div className="w-full my-3">
      <div className="bg-secondary/30 dark:bg-secondary/20 rounded-lg border border-border overflow-hidden">
        {/* Header - collapsible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-secondary/40 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              {title || 'To-dos'}
            </span>
            <span className="text-xs text-muted-foreground">
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
          <div className="px-3 pb-3 pt-1 space-y-1">
            {todos.map((todo, index) => (
              <div
                key={todo.id || index}
                className="flex items-start gap-2.5 py-1.5"
              >
                {/* Checkbox/Status indicator */}
                <div className="flex-shrink-0 mt-0.5">
                  {todo.status === 'completed' ? (
                    <div className="w-4 h-4 rounded border border-muted-foreground/30 bg-muted-foreground/10 flex items-center justify-center">
                      <Check className="w-3 h-3 text-muted-foreground" strokeWidth={2.5} />
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
                {todo.priority && todo.status !== 'completed' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${todo.priority === 'high'
                      ? 'bg-red-500/10 text-red-500'
                      : todo.priority === 'medium'
                        ? 'bg-yellow-500/10 text-yellow-500'
                        : 'bg-green-500/10 text-green-500'
                    }`}>
                    {todo.priority}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TodoList;
