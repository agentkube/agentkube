import React, { FC, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArchiveRestore } from "lucide-react";

interface BackupDialogProps {
  yamlContent: string;
}

const BackupDialog: FC<BackupDialogProps> = ({ yamlContent }) => {
  const [filename, setFilename] = useState(`resource-${Date.now()}.backup.yaml`);
  
  const handleBackup = (): void => {
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(url);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button 
          className="rounded-[0.3rem] bg-transparent text-black border-2 border-gray-500 hover:bg-gray-300"
        >
          <ArchiveRestore className="h-4 w-4 mr-2" />
          Backup
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Backup Resource</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="filename" className="text-sm font-medium">
              Filename
            </label>
            <Input
              id="filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full border border-gray-400 rounded-[0.4rem]"
            />
          </div>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button
            type="button"
            variant="default"
            className='rounded-[0.4rem]'
            onClick={handleBackup}
          >
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BackupDialog;