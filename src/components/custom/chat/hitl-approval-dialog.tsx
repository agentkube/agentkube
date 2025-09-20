import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, XCircle, Clock, Code } from 'lucide-react';
import { HITLApprovalRequest } from '@/types/hitl';
import { submitHITLDecision } from '@/api/orchestrator.chat';

interface HITLApprovalDialogProps {
  request: HITLApprovalRequest | null;
  isOpen: boolean;
  onClose: () => void;
  onDecisionSubmitted?: (requestId: string, approved: boolean) => void;
}

const HITLApprovalDialog: React.FC<HITLApprovalDialogProps> = ({
  request,
  isOpen,
  onClose,
  onDecisionSubmitted
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300); // 5 minutes in seconds
  const [error, setError] = useState<string | null>(null);

  // Auto-timeout effect
  useEffect(() => {
    if (!isOpen || !request) return;

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          handleDecision(false); // Auto-reject on timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, request]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen && request) {
      setTimeLeft(300);
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, request]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleDecision = async (approved: boolean) => {
    if (!request || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await submitHITLDecision({
        request_id: request.request_id,
        approved
      });

      onDecisionSubmitted?.(request.request_id, approved);
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit decision';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape' && !isSubmitting) {
      handleDecision(false);
    } else if (event.key === 'Enter' && !isSubmitting) {
      handleDecision(true);
    }
  };

  if (!request) return null;

  const requestTime = new Date(request.timestamp * 1000);
  const isUrgent = timeLeft <= 60; // Last minute

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="sm:max-w-md border-orange-200 dark:border-orange-900/50"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <AlertCircle className="h-5 w-5" />
            Function Approval Required
          </DialogTitle>
          <DialogDescription className="text-gray-600 dark:text-gray-400">
            The AI agent is requesting permission to execute a function. All functions require approval when HITL mode is enabled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Timeout indicator */}
          <div className={`flex items-center justify-between p-3 rounded-lg border ${
            isUrgent 
              ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50' 
              : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50'
          }`}>
            <div className="flex items-center gap-2">
              <Clock className={`h-4 w-4 ${isUrgent ? 'text-red-500' : 'text-blue-500'}`} />
              <span className={`text-sm font-medium ${isUrgent ? 'text-red-700 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'}`}>
                Time remaining
              </span>
            </div>
            <Badge variant={isUrgent ? 'destructive' : 'secondary'} className="font-mono">
              {formatTime(timeLeft)}
            </Badge>
          </div>

          {/* Function details */}
          <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border">
            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Function Name
              </div>
              <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-gray-500" />
                <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {request.function_name}
                </code>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Tool to Execute
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded border font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                {request.command}
              </div>
            </div>

            {Object.keys(request.function_args).length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Arguments
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded border font-mono text-sm text-gray-800 dark:text-gray-200">
                  {JSON.stringify(request.function_args, null, 2)}
                </div>
              </div>
            )}

            <div className="text-xs text-gray-500 dark:text-gray-400">
              Requested: {requestTime.toLocaleString()}
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <XCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Error</span>
              </div>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 sm:mb-0 sm:flex-1">
            Press Enter to approve, Escape to reject
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleDecision(false)}
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
            <Button
              onClick={() => handleDecision(true)}
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4" />
              {isSubmitting ? 'Submitting...' : 'Approve'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HITLApprovalDialog;