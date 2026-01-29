import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, Trash2 } from 'lucide-react';

interface AddMCPServerProps {
  open: boolean;
  onClose: () => void;
  serverName: string;
  serverType: string;
  serverUrl: string;
  serverCommand?: string;
  serverArgs?: string;
  serverEnv?: Record<string, string>;
  onServerEnvChange?: (env: Record<string, string>) => void;
  onServerNameChange: (value: string) => void;
  onServerTypeChange: (value: string) => void;
  onServerUrlChange: (value: string) => void;
  onServerCommandChange?: (value: string) => void;
  onServerArgsChange?: (value: string) => void;
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
  serverCommand = '',
  serverArgs = '',
  onServerNameChange,
  onServerTypeChange,
  onServerUrlChange,
  serverEnv = {},
  onServerEnvChange = () => { },
  onServerCommandChange = () => { },
  onServerArgsChange = () => { },
  onAdd,
  isEditing = false,
  isSaving = false
}) => {
  const [envKeys, setEnvKeys] = useState<string[]>(Object.keys(serverEnv));
  const [showEnvSection, setShowEnvSection] = useState(false);

  const handleEnvChange = (key: string, value: string) => {
    const newEnv = { ...serverEnv, [key]: value };
    onServerEnvChange(newEnv);
  };

  const addEnvVariable = () => {
    setEnvKeys([...envKeys, `ENV_VAR_${envKeys.length + 1}`]);
  };

  const removeEnvVariable = (key: string) => {
    const newEnv = { ...serverEnv };
    delete newEnv[key];
    onServerEnvChange(newEnv);
    setEnvKeys(envKeys.filter(k => k !== key));
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isSaving && !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md bg-gray-200 dark:bg-card">
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
                className="bg-white dark:bg-card border-gray-300 dark:border-gray-800/50 text-black dark:text-white"
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
                <SelectTrigger className="bg-white dark:bg-card border-gray-300 dark:border-gray-800/50 text-black dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-card border-gray-300 dark:border-gray-800/50 text-black dark:text-white">
                  <SelectItem value="remote">sse</SelectItem>
                  <SelectItem value="process">command</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {serverType === 'remote' ? (
            <div>
              <label htmlFor="server-url" className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
                Server URL
              </label>
              <Input
                id="server-url"
                placeholder="URL to SSE endpoint (e.g., http://localhost:8082/sse)"
                value={serverUrl}
                onChange={(e) => onServerUrlChange(e.target.value)}
                className="bg-white dark:bg-card border-gray-300 dark:border-gray-800/50 text-black dark:text-white"
                disabled={isSaving}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="server-command" className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
                  Command
                </label>
                <Input
                  id="server-command"
                  placeholder="Command (e.g., npx, python)"
                  value={serverCommand}
                  onChange={(e) => onServerCommandChange(e.target.value)}
                  className="bg-white dark:bg-card border-gray-300 dark:border-gray-800/50 text-black dark:text-white"
                  disabled={isSaving}
                />
              </div>
              <div>
                <label htmlFor="server-args" className="text-sm text-gray-600 dark:text-gray-400 block mb-1">
                  Arguments (space separated)
                </label>
                <Input
                  id="server-args"
                  placeholder="-y @modelcontextprotocol/server-filesystem /Applications"
                  value={serverArgs}
                  onChange={(e) => onServerArgsChange(e.target.value)}
                  className="bg-white dark:bg-card border-gray-300 dark:border-gray-800/50 text-black dark:text-white"
                  disabled={isSaving}
                />
              </div>
            </div>
          )}
        </div>


        {serverType === 'process' && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-600 dark:text-gray-400 block">
                Environment Variables
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowEnvSection(!showEnvSection)}
                className="text-xs"
              >
                {showEnvSection ? 'Hide' : 'Show'} Environment Variables
              </Button>
            </div>

            {showEnvSection && (
              <div className="space-y-3 bg-gray-100 dark:bg-gray-900/50 p-3 rounded-md">
                {envKeys.map(key => (
                  <div key={key} className="grid grid-cols-5 gap-2">
                    <Input
                      className="col-span-2 bg-white dark:bg-card"
                      value={key}
                      onChange={(e) => {
                        const newEnv = { ...serverEnv };
                        const oldValue = newEnv[key];
                        delete newEnv[key];
                        newEnv[e.target.value] = oldValue || '';
                        onServerEnvChange(newEnv);
                        setEnvKeys(envKeys.map(k => k === key ? e.target.value : k));
                      }}
                      placeholder="KEY"
                    />
                    <Input
                      className="col-span-2 bg-white dark:bg-card"
                      value={serverEnv[key] || ''}
                      onChange={(e) => handleEnvChange(key, e.target.value)}
                      placeholder="VALUE"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEnvVariable(key)}
                      className="h-9 w-9"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addEnvVariable}
                  className="w-full mt-2"
                >
                  Add Environment Variable
                </Button>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="flex justify-between mt-4">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
            disabled={isSaving}
          >
            Cancel
          </Button>

          <Button
            onClick={onAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            disabled={
              !serverName ||
              (serverType === 'remote' && !serverUrl) ||
              (serverType === 'process' && !serverCommand) ||
              isSaving
            }
          >
            {isSaving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                {isEditing ? 'Saving...' : 'Adding...'}
              </>
            ) : (
              isEditing ? 'Save Changes' : 'Add Server'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddMCPServer;