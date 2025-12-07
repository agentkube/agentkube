import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, CheckCheck, Shield, Terminal, UserRoundCheck, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { approveToolCall } from '@/api/orchestrator.chat';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from 'next-themes';

// Cast Prism to the appropriate React component type
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface ToolPermissionPromptProps {
  traceId: string;
  tool: string;
  args: any;
  callId: string;
  message: string;
  onClose: () => void;
}

export const ToolPermissionPrompt: React.FC<ToolPermissionPromptProps> = ({
  traceId,
  tool,
  args,
  callId,
  message,
  onClose
}) => {
  const [redirectMessage, setRedirectMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { theme } = useTheme();

  // Memoize formatted arguments string
  const formattedArguments = useMemo(() => {
    if (!args) return '';

    // If arguments is already an object, stringify it
    if (typeof args === 'object') {
      return JSON.stringify(args, null, 2);
    }

    // If it's a string, try to parse and re-stringify for formatting
    try {
      const parsed = JSON.parse(args);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      // If parsing fails, return as-is
      return String(args);
    }
  }, [args]);

  // Custom styles for syntax highlighter
  const customStyle = {
    backgroundColor: 'transparent',
    margin: 0,
    padding: '0.2rem 0.5rem',
    fontSize: '0.75rem',
    color: theme === "dark" ? "#f2f2f2CC" : "#000000"
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      await approveToolCall(traceId, callId, 'approve');
      onClose();
    } catch (error) {
      console.error('Failed to approve tool:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApproveForSession = async () => {
    setIsSubmitting(true);
    try {
      await approveToolCall(traceId, callId, 'approve_for_session');
      onClose();
    } catch (error) {
      console.error('Failed to approve tool for session:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeny = async () => {
    setIsSubmitting(true);
    try {
      await approveToolCall(traceId, callId, 'deny');
      onClose();
    } catch (error) {
      console.error('Failed to deny tool:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRedirect = async () => {
    if (!redirectMessage.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await approveToolCall(traceId, callId, 'redirect', redirectMessage);
      setRedirectMessage('');
      onClose();
    } catch (error) {
      console.error('Failed to redirect tool:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && redirectMessage.trim()) {
      handleRedirect();
    }
  };
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
        ease: [0.4, 0, 0.2, 1], // Smooth easing
      }}
      style={{
        transformOrigin: 'bottom', // Grow from bottom
      }}
    >
      <div className="px-3 py-3 bg-background/95 backdrop-blur-xl rounded-lg border dark:border-gary-500 shadow-xl">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-4 w-4 text-blue-500" />
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 ">
              The assistant wants to execute <span className="font-semibold text-gray-700 dark:text-gray-300">{tool}</span>
            </h4>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          {message}
        </p>

        <div className="bg-gray-300/50 dark:bg-gray-800/20 rounded-md overflow-auto max-h-32 mb-3">
          <SyntaxHighlighter
            language="json"
            style={oneDark}
            customStyle={customStyle}
            wrapLines={true}
            codeTagProps={{
              style: {
                fontSize: '0.75rem',
                fontFamily: 'Monaco, Menlo, monospace',
              }
            }}
          >
            {formattedArguments}
          </SyntaxHighlighter>
        </div>

        <div className='space-y-2'>
          <div className="grid grid-cols-3 items-center gap-2">
            <Button
              className="flex items-center justify-between"
              onClick={handleApprove}
              disabled={isSubmitting}
            >
              Allow
              <Check />
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-between"
              onClick={handleApproveForSession}
              disabled={isSubmitting}
            >
              Allow Always
              <CheckCheck />
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-between"
              onClick={handleDeny}
              disabled={isSubmitting}
            >
              Deny <X />
            </Button>
          </div>
          <Input
            placeholder='Tell Agentkube what to do instead'
            value={redirectMessage}
            onChange={(e) => setRedirectMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </motion.div>
  );
};
