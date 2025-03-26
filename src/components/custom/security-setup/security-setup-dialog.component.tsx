import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { Shield } from 'lucide-react';

const TrivySetupDialog = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800/20 px-4 py-2 rounded-[0.4rem] border border-gray-400 dark:border-gray-800/30 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800/50">
          <Shield className="h-5 w-5 text-green-600 dark:text-green-400" />
          <span>Trivy Operator Installed</span>
        </div>
      </DialogTrigger>
      <DialogContent className="max-w-3xl bg-gray-100 dark:bg-[#0B0D13] backdrop-blur-sm border border-gray-400 dark:border-gray-800/40">
        <DialogHeader>
          <DialogTitle>Trivy Operator Status</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Shield className="h-16 w-16 text-green-600 dark:text-green-400 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Trivy Operator is Running</h2>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mb-8">
            Trivy Operator is successfully installed and running in your cluster. 
            It is continuously scanning your container images and providing vulnerability reports.
          </p>
          <div className="text-sm text-gray-500">
            Installed in default namespace
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TrivySetupDialog;