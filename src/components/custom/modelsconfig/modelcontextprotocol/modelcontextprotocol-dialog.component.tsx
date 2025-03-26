import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface AddMCPServerProps {
  open: boolean;
  onClose: () => void;
  serverName: string;
  serverType: string;
  serverUrl: string;
  onServerNameChange: (value: string) => void;
  onServerTypeChange: (value: string) => void;
  onServerUrlChange: (value: string) => void;
  onAdd: () => void;
  isEditing?: boolean;
  isSaving?: boolean;
}

const AddMCPServer: React.FC<AddMCPServerProps> = ({ 
  open, 
  onClose, 
  serverName, 
  serverType, 
  serverUrl, 
  onServerNameChange, 
  onServerTypeChange, 
  onServerUrlChange, 
  onAdd,
  isEditing = false,
  isSaving = false
}) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isSaving && !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-gray-200 dark:bg-[#0B0D13]">
        <DialogHeader>
          <DialogTitle className="text-black dark:text-white">
            {isEditing ? 'Edit MCP Server' : 'Add MCP Server'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="server-name" className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
                Name
              </label>
              <Input
                id="server-name"
                placeholder="Server name"
                value={serverName}
                onChange={(e) => onServerNameChange(e.target.value)}
                className="bg-white dark:bg-[#0B0D13] border-gray-300 dark:border-gray-800/50 text-black dark:text-white"
                disabled={isSaving}
              />
            </div>
            <div>
              <label htmlFor="server-type" className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
                Type
              </label>
              <Select 
                value={serverType} 
                onValueChange={onServerTypeChange}
                disabled={isSaving}
              >
                <SelectTrigger className="bg-white dark:bg-[#0B0D13] border-gray-300 dark:border-gray-800/50 text-black dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-[#0B0D13] border-gray-300 dark:border-gray-800/50 text-black dark:text-white">
                  <SelectItem value="sse">sse</SelectItem>
                  {/* <SelectItem value="command">command</SelectItem> */}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <label htmlFor="server-url" className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
              Server URL
            </label>
            <Input
              id="server-url"
              placeholder="URL to SSE endpoint"
              value={serverUrl}
              onChange={(e) => onServerUrlChange(e.target.value)}
              className="bg-white dark:bg-[#0B0D13] border-gray-300 dark:border-gray-800/50 text-black dark:text-white"
              disabled={isSaving}
            />
          </div>
        </div>
        
        <DialogFooter className="flex justify-between mt-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
            disabled={isSaving}
          >
            Cancel (esc)
          </Button>
          
          <Button
            onClick={onAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={!serverName || !serverUrl || isSaving}
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                {isEditing ? 'Saving...' : 'Adding...'}
              </>
            ) : (
              isEditing ? 'Save Changes (↵)' : 'Add (↵)'
            )}
          </Button> 
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddMCPServer;