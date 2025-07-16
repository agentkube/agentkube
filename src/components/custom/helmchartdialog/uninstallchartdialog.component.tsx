import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Package } from "lucide-react";
import { HelmRelease } from '@/api/internal/helm';

interface UninstallChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  release: HelmRelease | null;
  onConfirm: () => void;
  isLoading?: boolean;
}

const UninstallChartDialog: React.FC<UninstallChartDialogProps> = ({
  open,
  onOpenChange,
  release,
  onConfirm,
  isLoading = false
}) => {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  if (!release) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md dark:bg-[#0B0D13]/50 backdrop-blur-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <DialogTitle className="text-left">Uninstall Helm Release</DialogTitle>
              <DialogDescription className="text-left">
                This action cannot be undone.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-gray-50 dark:bg-gray-900/50 p-4">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-gray-500 dark:text-gray-400" />
              <div>
                <div className="font-medium">{release.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Namespace: {release.namespace}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Chart: {release.chart?.metadata?.name || 'Unknown'}
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-300">
            Are you sure you want to uninstall <strong>{release.name}</strong> from namespace{' '}
            <strong>{release.namespace}</strong>? This will remove all associated resources.
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Uninstalling..." : "Uninstall"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UninstallChartDialog;