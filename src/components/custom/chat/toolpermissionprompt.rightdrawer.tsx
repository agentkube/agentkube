import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, CheckCheck, Shield, Terminal, UserRoundCheck, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ToolPermissionPromptProps {
  isVisible: boolean;
  onClose: () => void;
}

export const ToolPermissionPrompt: React.FC<ToolPermissionPromptProps> = ({
  isVisible,
  onClose
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
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
            ease: [0.4, 0, 0.2, 1], // Smooth easing
          }}
          style={{
            transformOrigin: 'bottom', // Grow from bottom
          }}
          className="absolute bottom-full left-0 right-0 mb-2 px-3 z-50"
        >
          <div className="px-3 py-3 bg-gray-50 dark:bg-gray-800/40 backdrop-blur-xl rounded-lg border dark:border-gary-500 shadow-xl">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <UserRoundCheck className="h-4 w-4 text-blue-500" />
                <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 ">
                  The assistant wants to execute a command in your cluster. Please review and approve.
                </h4>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">

            </p>

            <div className="flex items-center gap-2 bg-gray-100 text-gray-800 dark:text-gray-400 bg-transparent border dark:border-gray-500/20 rounded p-2 mb-3">
              <Terminal className='h-4 w-4' />
              <code className="text-xs  font-mono">
                kubectl get pods -n kube-system
              </code>
            </div>

            <div className='space-y-2'>
              <div className="grid grid-cols-3 items-center gap-2">
                <Button
                  className="flex items-center justify-between"
                >
                  Allow
                  <Check />
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center justify-between"
                >
                  Allow Always
                  <CheckCheck />
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center justify-between"
                  onClick={onClose}
                >
                  Deny <X />
                </Button>
              </div>
              <Input className='h-7 px-2 dark:border-gray-300/10' placeholder='Tell Agentkube what to do instead' />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
