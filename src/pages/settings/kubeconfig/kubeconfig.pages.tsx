import React, { useState, useEffect, useRef } from 'react';
import { File, FolderPlus, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSettings, patchConfig, updateSettingsSection } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AddKubeConfigDialog from '@/components/custom/kubeconfig/addkubeconfig.component';
import { getUploadedContexts, deleteUploadedContext, validateKubeconfigPath, validateKubeconfigFolder, uploadKubeconfigContent } from '@/api/cluster';
import { useCluster } from '@/contexts/clusterContext';

const Kubeconfig = () => {
  const { contexts } = useCluster();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mergeFiles, setMergeFiles] = useState(false);
  const [kubeConfigPath, setKubeConfigPath] = useState('');
  const [externalPaths, setExternalPaths] = useState<string[]>([]);
  const [contextAutoRefresh, setContextAutoRefresh] = useState(true);
  const [contextRefreshInterval, setContextRefreshInterval] = useState(300);
  const [contextRegionExtension, setContextRegionExtension] = useState(true);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  // UI state
  const [fileCount, setFileCount] = useState(1);
  const [contextCount, setContextCount] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPathDialogOpen, setIsPathDialogOpen] = useState(false);
  const [newPath, setNewPath] = useState('');

  const { toast } = useToast();
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getSettings();

        // Set state with kubeconfig settings
        setKubeConfigPath(settings.kubeconfig.path);
        setExternalPaths(settings.kubeconfig.externalPaths || []);
        setContextAutoRefresh(settings.kubeconfig.contextAutoRefresh);
        setContextRefreshInterval(settings.kubeconfig.contextRefreshInterval);
        setContextRegionExtension(settings.kubeconfig.contextRegionExtension);

        // Mock data for now - in a real app you might get this from an API
        setFileCount(1 + (settings.kubeconfig.externalPaths?.length || 0));
        setContextCount(contexts.length);
      } catch (error) {
        console.error('Failed to load kubeconfig settings:', error);
        toast({
          title: "Error loading settings",
          description: "Could not load kubeconfig settings. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [toast, contexts.length]);

  // Save kubeconfig settings
  const saveKubeconfigSettings = async () => {
    try {
      setIsSaving(true);

      await patchConfig({
        kubeconfig: {
          path: kubeConfigPath,
          externalPaths,
          contextAutoRefresh,
          contextRefreshInterval,
          contextRegionExtension
        }
      });

      toast({
        title: "Settings saved",
        description: "Your kubeconfig settings have been updated.",
      });
    } catch (error) {
      console.error('Failed to save kubeconfig settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save your kubeconfig settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddFiles = () => {
    setIsUploadDialogOpen(true);
  };

  const handleRemovePath = async (index: number, path: string) => {
    const updatedPaths = externalPaths.filter((_, i) => i !== index);

    // First update state locally
    setExternalPaths(updatedPaths);
    setFileCount(prev => prev - 1);

    try {
      // Update settings to remove from externalPaths
      await updateSettingsSection('kubeconfig', {
        externalPaths: updatedPaths
      });

      // If this path was from an uploaded kubeconfig, also delete the contexts
      // Check if the path contains uploaded configs and delete them
      const uploadedContexts = await getUploadedContexts();
      const contextsToDelete = uploadedContexts.contexts.filter(ctx =>
        ctx.name && path.includes(ctx.name.split('-')[0]) // Match source name
      );

      // Delete each context associated with this path
      for (const context of contextsToDelete) {
        try {
          await deleteUploadedContext(context.name);
        } catch (error) {
          console.error(`Failed to delete context ${context.name}:`, error);
        }
      }

      toast({
        title: "Path removed",
        description: "External path and associated contexts have been removed successfully.",
      });
    } catch (error) {
      console.error('Failed to remove path:', error);
      // Restore previous state if API call fails
      setExternalPaths(externalPaths);
      setFileCount(prev => prev + 1);
      toast({
        title: "Error removing path",
        description: "Could not remove the external path. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (refreshTrigger > 0) {
      const fetchSettings = async () => {
        try {
          const settings = await getSettings();
          setExternalPaths(settings.kubeconfig.externalPaths || []);
          setFileCount(1 + (settings.kubeconfig.externalPaths?.length || 0));
        } catch (error) {
          console.error('Failed to refresh settings:', error);
        }
      };
      fetchSettings();
    }
  }, [refreshTrigger]);

  const handleFilesAdded = (paths: string[]) => {
    if (paths.length === 0) {
      // Just trigger a refresh of contexts from the backend
      setRefreshTrigger(prev => prev + 1);
      return;
    }

    // Add the new paths to your externalPaths state
    const updatedPaths = [...externalPaths, ...paths];
    setExternalPaths(updatedPaths);
    setFileCount(prev => prev + paths.length);

    // Save to backend
    updateSettingsSection('kubeconfig', {
      externalPaths: updatedPaths
    });
  };

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const kubeconfigFiles = Array.from(files).filter(file =>
      file.name.includes('config') ||
      file.name.endsWith('.yaml') ||
      file.name.endsWith('.yml') ||
      file.name.endsWith('.json') ||
      file.name.endsWith('.kubeconfig')
    );

    if (kubeconfigFiles.length === 0) {
      toast({
        title: "No kubeconfig files found",
        description: "No valid kubeconfig files found in the selected folder.",
        variant: "destructive",
      });
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const file of kubeconfigFiles) {
      try {
        const content = await file.text();
        const sourceName = file.name.replace(/\.(yaml|yml|json)$/, '');

        await uploadKubeconfigContent({
          content,
          sourceName,
          ttl: 0 // No expiry
        });

        successCount++;
      } catch (error) {
        console.error(`Failed to upload ${file.name}:`, error);
        errorCount++;
      }
    }

    // Reset the input
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }

    // Refresh contexts
    setRefreshTrigger(prev => prev + 1);

    toast({
      title: successCount > 0 ? "Folder processed" : "Upload failed",
      description: `${successCount} files uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
      variant: successCount > 0 ? "default" : "destructive",
    });
  };

  const handleAddFolder = () => {
    folderInputRef.current?.click();
  };

  const handleEnterPath = () => {
    setIsPathDialogOpen(true);
  };

  const handleMergeFilesChange = () => {
    setMergeFiles(!mergeFiles);
    // In a real app, this setting would be saved immediately or queued for later save
  };

  const handleAddExternalPath = async () => {
    if (!newPath.trim()) return;

    try {
      // Validate the path first
      const result = await validateKubeconfigPath(newPath.trim());

      if (result.success) {
        const updatedPaths = [...externalPaths, result.path];
        setExternalPaths(updatedPaths);
        setNewPath('');
        setIsPathDialogOpen(false);
        setFileCount(prev => prev + 1);

        await updateSettingsSection('kubeconfig', {
          externalPaths: updatedPaths
        });

        toast({
          title: "Path added",
          description: `Valid kubeconfig with ${result.contextCount} contexts added successfully.`,
        });
      }
    } catch (error) {
      toast({
        title: "Invalid path",
        description: error instanceof Error ? error.message : "Could not validate kubeconfig path.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading kubeconfig settings...</span>
      </div>
    );
  }

  return (
    <div className="px-4 dark:text-white">

      {/* Kubeconfig Sources Section */}
      <div className="mb-10">
        <h2 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Kubeconfig Sources</h2>
        <p className="text-gray-600 dark:text-gray-400 text-xs mb-1">
          Agentkube needs to know where your Kubeconfig files are located.
        </p>
        <p className="text-gray-600 dark:text-gray-400 text-xs mb-6">
          By default Agentkube uses the same location as kubectl.
        </p>

        {/* Path Display */}
        <div className="dark:bg-transparent text-medium rounded border border-gray-400/50 dark:border-gray-700/60 py-2 px-4 mb-4">
          <div className="flex items-start">
            <FileText className="dark:text-gray-400 mr-3 mt-1" size={20} />
            <div>
              <div className="dark:text-white">{kubeConfigPath}</div>
              <div className="dark:text-gray-500 text-xs mt-1">
                {fileCount} file{fileCount !== 1 ? 's' : ''} • {contextCount} contexts
              </div>
            </div>
          </div>
        </div>

        {/* External Paths */}
        {externalPaths.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium mb-2">Additional Paths</h3>
            {externalPaths.map((path, index) => (
              <div
                key={index}
                className="dark:bg-transparent text-medium rounded border border-gray-400 dark:border-gray-800 py-2 px-4 mb-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start">
                    <FileText className="dark:text-gray-400 mr-3 mt-1" size={20} />
                    <div className="dark:text-gray-400">{path}</div>
                  </div>
                  <button
                    className="text-red-500 hover:text-red-700"
                    onClick={() => handleRemovePath(index, path)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <Button
            variant="outline"
            onClick={handleAddFiles}
          >
            <File size={16} className="mr-2" />
            Add Files
          </Button>
          {/* <Button
            variant="outline"
            onClick={handleAddFolder}
          >
            <FolderPlus size={16} className="mr-2" />
            Add Folder
          </Button>
          <input
            ref={folderInputRef}
            type=""
            multiple
            onChange={handleFolderSelect}
            className="hidden"
            accept=".yaml,.yml,.json,.kubeconfig"
            {...({ webkitdirectory: true } as any)}
          /> */}
          <Button
            variant="outline"
            onClick={handleEnterPath}
          >
            Enter Path
          </Button>
        </div>
      </div>

      {/* Kubeconfig Settings Section */}
      <div className="mb-10">
        <h2 className="text-xl font-medium mb-4">Kubeconfig Settings</h2>

        <div className="flex items-start mb-4">
          <input
            type="checkbox"
            id="mergeFiles"
            checked={mergeFiles}
            onChange={handleMergeFilesChange}
            className="mt-1 mr-3"
          />
          <div>
            <label htmlFor="mergeFiles" className="font-medium cursor-pointer">Merge Files</label>
            <p className="text-gray-700 dark:text-gray-400 text-xs mt-1">
              When enabled, Agentkube will read each kubeconfig and merge them into a single file during processing.
            </p>
            <p className="text-gray-700 dark:text-gray-400 text-xs mt-1">
              Enable this if your kubeconfigs are not complete. E.g: some files have contexts, others have clusters and/or users.
            </p>
            <p className="text-gray-700 dark:text-gray-400 text-xs mt-1">
              Regardless of this setting, Agentkube will never modify your kubeconfig files.
            </p>
          </div>
        </div>

        <div className="flex items-start mb-4">
          <input
            type="checkbox"
            id="autoRefresh"
            checked={contextAutoRefresh}
            onChange={() => {
              setContextAutoRefresh(!contextAutoRefresh);
              saveKubeconfigSettings();
            }}
            className="mt-1 mr-3"
          />
          <div>
            <label htmlFor="autoRefresh" className="font-medium cursor-pointer">Auto Refresh Contexts</label>
            <p className="text-gray-700 dark:text-gray-400 text-xs mt-1">
              When enabled, Agentkube will automatically refresh contexts at the specified interval.
            </p>
          </div>
        </div>

        {contextAutoRefresh && (
          <div className="flex items-start mb-4 ml-6">
            <div>
              <label htmlFor="refreshInterval" className="font-medium block mb-1">Refresh Interval (seconds)</label>
              <input
                type="number"
                id="refreshInterval"
                value={contextRefreshInterval}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (value > 0) {
                    setContextRefreshInterval(value);
                  }
                }}
                onBlur={() => saveKubeconfigSettings()}
                className="bg-transparent border border-gray-400 dark:border-gray-700 rounded px-2 py-1 w-24 text-sm"
                min="30"
              />
            </div>
          </div>
        )}
      </div>

      <AddKubeConfigDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onFilesAdded={handleFilesAdded}
      />

      {/* Path Input Dialog */}
      <Dialog open={isPathDialogOpen} onOpenChange={setIsPathDialogOpen}>
        <DialogContent className="bg-gray-100 dark:bg-[#0B0D13]/30 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle>Add Kubeconfig Path</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="path" className="block mb-2">Path to kubeconfig file or directory</Label>
            <Input
              id="path"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/path/to/kubeconfig"
              className="w-full"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPathDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddExternalPath}>
              Add Path
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Kubeconfig;