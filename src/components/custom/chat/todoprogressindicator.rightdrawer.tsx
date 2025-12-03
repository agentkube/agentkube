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
      <div className="bg-gray-50 dark:bg-[#0B0D13]/80 backdrop-blur-xl rounded-lg border dark:border-gray-700/40 shadow-xl">
        {/* Header with progress summary */}
        <div className="p-2 flex dark:bg-gray-800/50 hover:opacity-80 cursor-pointer transition-opacity items-center justify-between" onClick={() => setIsExpanded(!isExpanded)}>
          <button

            className="flex items-center gap-2 "
          >
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {completedCount} out of {totalCount} tasks completed
              </span>
            </div>
          </button>
          <div className='flex gap-2'>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              {isExpanded ? (
                <Minimize2 className="h-3.5 w-3.5 text-gray-500" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5 text-gray-500" />
              )}
            </button>
            <button
              onClick={() => onClose()}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              <X className="h-4 w-4 text-gray-500" />
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
              className="overflow-hidden p-3"
            >
              <div className="space-y-2 max-h-48 mt-2 overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/30 [&::-webkit-scrollbar-thumb]:rounded-full">
                {todos.map((todo, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-xs"
                  >
                    {/* Status icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {todo.status === 'completed' && (
                        <div className="w-4 h-4 rounded-full bg-white dark:bg-white flex items-center justify-center">
                          <Check className="w-3 h-3 text-black" strokeWidth={3} />
                        </div>
                      )}
                      {todo.status === 'in_progress' && (
                        <Loader2 className="w-4 h-4 text-blue-500 dark:text-blue-400 animate-spin" />
                      )}
                      {todo.status === 'pending' && (
                        <Circle className="w-4 h-4 text-gray-400 dark:text-gray-500" strokeWidth={2} />
                      )}
                    </div>

                    {/* Todo content */}
                    <span
                      className={`flex-1 ${todo.status === 'completed'
                        ? 'text-gray-500 dark:text-gray-400 line-through'
                        : todo.status === 'in_progress'
                          ? 'text-gray-700 dark:text-gray-200 font-medium'
                          : 'text-gray-600 dark:text-gray-300'
                        }`}
                    >
                      {todo.content}
                    </span>
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
