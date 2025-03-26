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
      <AlertDialogContent className="max-w-md bg-gray-50 dark:bg-[#0B0D13] border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-gray-600 dark:text-gray-400">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="my-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-md">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            You are about to delete {resourceType}: <span className="font-bold">{resourceName}</span>
          </p>
          <p className="mt-1 text-xs text-red-700 dark:text-red-400">
            This action cannot be undone.
          </p>
        </div>
        
        <AlertDialogFooter>
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="border-gray-300 dark:border-gray-700"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              disabled={isLoading}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
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