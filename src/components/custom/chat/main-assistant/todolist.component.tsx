import React from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { TodoItem } from '@/api/orchestrator.chat';

interface TodoListProps {
  todos: TodoItem[];
}

const TodoList: React.FC<TodoListProps> = ({ todos }) => {
  if (!todos || todos.length === 0) {
    return null;
  }

  return (
    <div className="w-full mb-4">
      <div className="bg-gray-200/40 dark:bg-gray-800/30 rounded-lg p-3 border border-gray-300 dark:border-gray-700/40">
        <div className="space-y-2">
          {todos.map((todo, index) => (
            <div
              key={index}
              className="flex items-start gap-2 text-sm"
            >
              {/* Status icon */}
              <div className="flex-shrink-0 mt-0.5">
                {todo.status === 'completed' && (
                  <div className="w-4 h-4 rounded-full bg-green-500 dark:bg-green-600 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" strokeWidth={3} />
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
                className={`flex-1 ${
                  todo.status === 'completed'
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
      </div>
    </div>
  );
};

export default TodoList;
