import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Edit3 } from 'lucide-react';
import { renameContext } from '@/api/cluster';
import { toast } from '@/hooks/use-toast';

interface RenameContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextToRename: string | null;
  onRenameSuccess: (oldName: string, newName: string) => void;
  onCancel: () => void;
}

const RenameContextDialog: React.FC<RenameContextDialogProps> = ({
  open,
  onOpenChange,
  contextToRename,
  onRenameSuccess,
  onCancel,
}) => {
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open && contextToRename) {
      setNewName(contextToRename);
      setValidationError('');
    } else {
      setNewName('');
      setValidationError('');
    }
  }, [open, contextToRename]);

  // Validate context name
  const validateContextName = (name: string): boolean => {
    if (!name.trim()) {
      setValidationError('Context name cannot be empty');
      return false;
    }
    
    if (name.trim() === contextToRename) {
      setValidationError('New name must be different from the current name');
      return false;
    }
    
    // Basic validation for kubernetes context names
    if (!/^[a-zA-Z0-9._-]+$/.test(name.trim())) {
      setValidationError('Context name can only contain letters, numbers, dots, hyphens, and underscores');
      return false;
    }
    
    setValidationError('');
    return true;
  };

  // Handle input change with validation
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewName(value);
    
    // Clear validation error when user starts typing
    if (validationError) {
      setValidationError('');
    }
  };

  // Handle form submission
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!contextToRename || !validateContextName(newName)) {
      return;
    }

    const trimmedNewName = newName.trim();
    setIsRenaming(true);
    
    try {
      const result = await renameContext(contextToRename, trimmedNewName);
      
      toast({
        title: "Success",
        description: result.message || `Context renamed from "${contextToRename}" to "${trimmedNewName}"`
      });
      
      // Notify parent component of successful rename
      onRenameSuccess(contextToRename, trimmedNewName);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: `Failed to rename context: ${errorMessage}`,
        variant: "destructive"
      });
      setValidationError(errorMessage);
    } finally {
      setIsRenaming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-white dark:bg-[#0B0D13]/30 backdrop-blur-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 size={20} />
            Rename Kubernetes Context
          </DialogTitle>
          <DialogDescription>
            Rename the context "{contextToRename}" to a new name.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleRename}>
          <div className="grid gap-4 py-4">          
            <div className="space-y-2">
              <Label htmlFor="new-name">New name</Label>
              <Input
                id="new-name"
                type="text"
                value={newName}
                onChange={handleNameChange}
                placeholder="Enter new context name"
                disabled={isRenaming}
                className={validationError ? "border-red-500" : ""}
              />
              {validationError && (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {validationError}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              type="button"
              variant="outline" 
              onClick={onCancel} 
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button 
              type="submit"
              disabled={isRenaming || !newName.trim() || newName.trim() === contextToRename || !!validationError}
            >
              {isRenaming ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RenameContextDialog;