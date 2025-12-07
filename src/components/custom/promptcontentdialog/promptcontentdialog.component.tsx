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
      <DialogContent className="max-w-2xl bg-card backdrop-blur-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between px-6">
            <DialogTitle className="text-xs flex items-end">
              <div className="bg-secondary/30 w-7 h-7 rounded-md overflow-hidden flex items-center justify-center mr-2 text-green-400 mt-1">
                <AgentkubeBot className="h-5 w-5" />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
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

        <div className="space-y-4 max-w-xl mx-auto">
          <div className="bg-secondary rounded-lg border ">
            <div className="text-sm text-foreground max-h-64 overflow-y-auto
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-border 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-border/70 p-4 ">
              <MarkdownContent content={content} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
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