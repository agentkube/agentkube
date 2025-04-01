import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';

interface DeleteContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextToDelete: string | null;
  onConfirmDelete: () => void;
  onCancel: () => void;
}

const DeleteContextDialog: React.FC<DeleteContextDialogProps> = ({
  open,
  onOpenChange,
  contextToDelete,
  onConfirmDelete,
  onCancel,
}) => {
  const { contexts, currentContext, setCurrentContext } = useCluster();
  const [alternativeContext, setAlternativeContext] = useState<string>('');
  const [isCurrentContext, setIsCurrentContext] = useState(false);
  const [availableContexts, setAvailableContexts] = useState<string[]>([]);

  // Check if the context to delete is the current one
  useEffect(() => {
    if (contextToDelete && currentContext) {
      const isCurrentlyActive = contextToDelete === currentContext.name;
      setIsCurrentContext(isCurrentlyActive);
      
      // Get all available contexts except the one being deleted
      const otherContexts = contexts
        .filter(ctx => ctx.name !== contextToDelete)
        .map(ctx => ctx.name);
      
      setAvailableContexts(otherContexts);
      
      // Set a default alternative context if needed
      if (isCurrentlyActive && otherContexts.length > 0) {
        setAlternativeContext(otherContexts[0]);
      }
    }
  }, [contextToDelete, currentContext, contexts]);

  const handleSwitchAndDelete = async () => {
    if (isCurrentContext && alternativeContext) {
      // Find the context object to switch to
      const newContext = contexts.find(ctx => ctx.name === alternativeContext);
      if (newContext) {
        // TODO: Implement API call to change the context in kubeconfig
        setCurrentContext(newContext);
      }
    }
    
    // TODO: Implement API call to delete the context from kubeconfig
    
    // Proceed with the UI update
    onConfirmDelete();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#0B0D13]">
        <DialogHeader>
          <DialogTitle>Delete Kubernetes Context</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the context "{contextToDelete}"?
          </DialogDescription>
        </DialogHeader>
        
        {isCurrentContext && (
          <div className="py-4">
            <Alert variant="destructive" className="mb-4  dark:text-red-500/80">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                You are deleting your current active context. You need to select another context before proceeding.
              </AlertDescription>
            </Alert>
            
            {availableContexts.length > 0 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Switch to context:</label>
                <Select value={alternativeContext} onValueChange={setAlternativeContext}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a context" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableContexts.map(ctx => (
                      <SelectItem key={ctx} value={ctx}>{ctx}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-red-500">
                No other contexts available. You cannot delete your only context.
              </p>
            )}
          </div>
        )}
        
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleSwitchAndDelete}
            disabled={isCurrentContext && (availableContexts.length === 0 || !alternativeContext)}
          >
            {isCurrentContext ? "Switch and Delete" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteContextDialog;