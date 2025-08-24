import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, MessageSquare } from 'lucide-react';
import { useDrawer } from '@/contexts/useDrawer';
import MarkdownContent from '@/utils/markdown-formatter';
import { AgentkubeBot } from '@/assets/icons';

interface PromptContentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  content: string | null;
}

const PromptContentDialog: React.FC<PromptContentDialogProps> = ({
  isOpen,
  onClose,
  content,
}) => {
  const [customMessage, setCustomMessage] = useState('');
  const { setIsOpen: setDrawerOpen } = useDrawer();

  const handleResolveWithChat = () => {
    if (!content) return;

    // Use the content as-is with optional custom message
    const finalMessage = customMessage ? `${customMessage}\n\n${content}` : content;

    // Store the message to be sent in the drawer
    sessionStorage.setItem('pendingChatMessage', finalMessage);

    // Open the chat drawer
    setDrawerOpen(true);

    // Close this dialog
    onClose();
    setCustomMessage('');
  };

  if (!content) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl dark:bg-[#0B0D13]/50 backdrop-blur-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xs flex items-end">
              <div className="dark:bg-gray-700/30 w-7 h-7 rounded-md overflow-hidden flex items-center justify-center mr-2 text-green-400 mt-1">
                <AgentkubeBot className="h-5 w-5" />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {content && (
              <>
                {content.length} characters • {content.split('\n').length} lines •
                {" "}
                <span className="italic">Formatting may be inconsistent from source</span>
              </>
            )}
          </div>
            </DialogTitle>

          </div>
  
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-gray-50 dark:bg-gray-800/20 rounded-lg border">
            <div className="text-sm text-gray-700 dark:text-gray-300 max-h-64 overflow-y-auto overflow-y-auto 
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50 p-4 ">
              <MarkdownContent content={content} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Additional Context (Optional)
            </label>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add any specific questions or context about this issue..."
              className="min-h-20"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PromptContentDialog;