import React from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface DeletionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  resourceName: string;
  resourceType: string;
  isLoading?: boolean;
}

const DeletionDialog: React.FC<DeletionDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  resourceName,
  resourceType,
  isLoading = false,
}) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md bg-card border-border rounded-2xl shadow-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="my-4 p-3 bg-destructive/10 border border-destructive/40 rounded-md">
          <p className="text-sm font-medium text-destructive">
            You are about to delete {resourceType}: <span className="font-bold">{resourceName}</span>
          </p>
          <p className="mt-1 text-xs text-destructive">
            This action cannot be undone.
          </p>
        </div>

        <AlertDialogFooter>
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="border-border"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isLoading}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isLoading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeletionDialog;