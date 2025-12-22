import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Circle, Loader2, X, ListTodo, Maximize2, Minimize2 } from 'lucide-react';
import { TodoItem } from '@/api/orchestrator.chat';

interface TodoProgressIndicatorProps {
  todos: TodoItem[];
  onClose: () => void;
}

export const TodoProgressIndicator: React.FC<TodoProgressIndicatorProps> = ({
  todos,
  onClose
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const completedCount = todos.filter(t => t.status === 'completed').length;
  const totalCount = todos.length;

  return (
    <motion.div
      initial={{
        y: 20,
        opacity: 0,
        scaleY: 0,
      }}
      animate={{
        y: 0,
        opacity: 1,
        scaleY: 1,
      }}
      exit={{
        y: 20,
        opacity: 0,
        scaleY: 0,
      }}
      transition={{
        duration: 0.3,
        ease: [0.4, 0, 0.2, 1],
      }}
      style={{
        transformOrigin: 'bottom',
      }}
    >
      <div className="bg-secondary/30 dark:bg-secondary/20 backdrop-blur-xl rounded-lg border border-border shadow-xl overflow-hidden">
        {/* Header with progress summary */}
        <div
          className="px-3 py-2 flex items-center justify-between hover:bg-secondary/40 cursor-pointer transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">
              To-dos
            </span>
            <span className="text-xs text-muted-foreground">
              {completedCount}/{totalCount}
            </span>
          </div>
          <div className='flex items-center gap-1.5'>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            >
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expandable todo list */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-1 space-y-1 max-h-60 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                {todos.map((todo, index) => (
                  <div
                    key={todo.id || index}
                    className="flex items-start gap-2.5 py-1.5"
                  >
                    {/* Checkbox/Status indicator - matching TodoList design */}
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

                    {/* Priority indicator - matching TodoList design */}
                    {todo.priority && todo.status !== 'completed' && (
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${todo.priority === 'high'
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
