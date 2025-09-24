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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useCluster } from '@/contexts/clusterContext';
import { deleteContext } from '@/api/cluster';
import { toast } from '@/hooks/use-toast';

interface DeleteContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextToDelete: string | null;
  onDeleteSuccess: (deletedContextName: string) => void;
  onCancel: () => void;
}

const DeleteContextDialog: React.FC<DeleteContextDialogProps> = ({
  open,
  onOpenChange,
  contextToDelete,
  onDeleteSuccess,
  onCancel,
}) => {
  const { contexts, currentContext, setCurrentContext } = useCluster();
  const [alternativeContext, setAlternativeContext] = useState<string>('');
  const [isCurrentContext, setIsCurrentContext] = useState(false);
  const [availableContexts, setAvailableContexts] = useState<string[]>([]);
  const [allowSystemKubeconfigDeletion, setAllowSystemKubeconfigDeletion] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      
      // Reset checkbox state when dialog opens
      setAllowSystemKubeconfigDeletion(false);
    }
  }, [contextToDelete, currentContext, contexts]);

  const handleSwitchAndDelete = async () => {
    if (!contextToDelete) return;
    
    setIsDeleting(true);
    
    try {
      // If deleting current context and alternative is selected, switch first
      if (isCurrentContext && alternativeContext) {
        const newContext = contexts.find(ctx => ctx.name === alternativeContext);
        if (newContext) {
          setCurrentContext(newContext);
        }
      }
      
      // Delete the context using the API
      const result = await deleteContext(contextToDelete, allowSystemKubeconfigDeletion);
      
      toast({
        title: "Success",
        description: result.message || `Context "${contextToDelete}" deleted successfully`
      });
      
      // Notify parent component of successful deletion
      onDeleteSuccess(contextToDelete);
      
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to delete context: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
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
        
        {/* Checkbox for allowing system kubeconfig deletion */}
        <div className="py-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="allow-system-deletion"
              checked={allowSystemKubeconfigDeletion}
              onCheckedChange={(checked) => setAllowSystemKubeconfigDeletion(checked === true)}
            />
            <label
              htmlFor="allow-system-deletion"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Allow system kubeconfig deletion (modifies ~/.kube/config)
            </label>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 ml-6">
            When checked, this will also remove the context from your system kubeconfig file (~/.kube/config).
            Leave unchecked for safer deletion that only affects Agentkube.
          </p>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleSwitchAndDelete}
            disabled={isDeleting || (isCurrentContext && (availableContexts.length === 0 || !alternativeContext))}
          >
            {isDeleting ? "Deleting..." : (isCurrentContext ? "Switch and Delete" : "Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteContextDialog;