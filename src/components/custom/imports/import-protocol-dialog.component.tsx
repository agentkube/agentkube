// ImportProtocolDialog.tsx
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Upload, Link as LinkIcon } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

interface ImportProtocolDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (content: string) => Promise<void>;
  isLoading?: boolean;
}

const ImportProtocolDialog: React.FC<ImportProtocolDialogProps> = ({
  isOpen,
  onClose,
  onImport,
  isLoading = false
}) => {
  const { toast } = useToast();
  const [url, setUrl] = useState<string>('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      try {
        const reader = new FileReader();
        reader.onload = async (e: ProgressEvent<FileReader>) => {
          const content = e.target?.result;
          if (typeof content === 'string') {
            await onImport(content);
            setUrl('');
          }
        };
        reader.readAsText(file);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Import failed",
          description: error instanceof Error ? error.message : "Failed to import protocol",
        });
      }
    }
  }, [onImport, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/yaml': ['.yaml', '.yml']
    },
    multiple: false,
    disabled: isLoading
  });

  const handleUrlSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (url) {
      try {
        await onImport(url);
        setUrl('');
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Import failed",
          description: error instanceof Error ? error.message : "Failed to import protocol",
        });
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] bg-gray-100">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Import Protocol</DialogTitle>
          </div>
        </DialogHeader>

        <div className="mt-4">
          <form onSubmit={handleUrlSubmit}>
            <Input
              className="border border-gray-500 rounded-[0.5rem] text-gray-300 mb-4"
              placeholder="Paste YAML content..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
            />
          </form>
          
          <div 
            {...getRootProps()} 
            className={`
              border border-dashed border-gray-200 rounded-xl p-8 text-center
              ${isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700'}
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-500'}
              transition-colors
              bg-gray-200
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-2 text-gray-600">
              <Upload className="h-8 w-8 mb-2" />
              <p className="text-lg">
                {isLoading ? "Importing..." : "Drop YAML file to import"}
              </p>
              <p className="text-sm">Or select a YAML file</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
            <LinkIcon className="h-4 w-4" />
            <span>Supported formats:</span>
            <span className="text-blue-400">.yaml, .yml</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportProtocolDialog;