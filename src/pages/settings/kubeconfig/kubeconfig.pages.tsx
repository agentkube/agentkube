import React, { useState, useEffect } from 'react';
import { File, FolderPlus, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSettings, patchConfig, updateSettingsSection } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const Kubeconfig = () => {
  // State for kubeconfig settings
  const [mergeFiles, setMergeFiles] = useState(false);
  const [kubeConfigPath, setKubeConfigPath] = useState('');
  const [externalPaths, setExternalPaths] = useState<string[]>([]);
  const [contextAutoRefresh, setContextAutoRefresh] = useState(true);
  const [contextRefreshInterval, setContextRefreshInterval] = useState(300);
  const [contextRegionExtension, setContextRegionExtension] = useState(true);

  // UI state
  const [fileCount, setFileCount] = useState(1);
  const [contextCount, setContextCount] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPathDialogOpen, setIsPathDialogOpen] = useState(false);
  const [newPath, setNewPath] = useState('');

  const { toast } = useToast();

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
        setContextCount(3); // This would come from another API call in a real app
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
  }, [toast]);

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
    // In a real app, this would open a file picker dialog
    // For now, we'll just simulate adding a file
    toast({
      title: "Feature not implemented",
      description: "File picker dialog would open here in the actual application.",
    });
  };

  const handleAddFolder = () => {
    // In a real app, this would open a folder picker dialog
    toast({
      title: "Feature not implemented",
      description: "Folder picker dialog would open here in the actual application.",
    });
  };

  const handleEnterPath = () => {
    setIsPathDialogOpen(true);
  };

  const handleMergeFilesChange = () => {
    setMergeFiles(!mergeFiles);
    // In a real app, this setting would be saved immediately or queued for later save
  };

  const handleAddExternalPath = async () => {
    if (newPath.trim()) {
      const updatedPaths = [...externalPaths, newPath.trim()];
      setExternalPaths(updatedPaths);
      setNewPath('');
      setIsPathDialogOpen(false);

      // Update file count
      setFileCount(prev => prev + 1);

      // Save the external paths
      try {
        await updateSettingsSection('kubeconfig', {
          externalPaths: updatedPaths
        });

        toast({
          title: "Path added",
          description: "External path has been added successfully.",
        });
      } catch (error) {
        console.error('Failed to save external path:', error);
        toast({
          title: "Error saving path",
          description: "Could not save the external path. Please try again.",
          variant: "destructive",
        });
      }
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
                className="dark:bg-gray-900/50 text-medium rounded border border-gray-400 dark:border-gray-700 py-2 px-4 mb-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start">
                    <FileText className="dark:text-gray-400 mr-3 mt-1" size={20} />
                    <div className="dark:text-white">{path}</div>
                  </div>
                  <button
                    className="text-red-500 hover:text-red-700"
                    onClick={async () => {
                      const updatedPaths = externalPaths.filter((_, i) => i !== index);

                      // First update state locally
                      setExternalPaths(updatedPaths);
                      setFileCount(prev => prev - 1);

                      // Then update ONLY this specific setting
                      try {
                        await updateSettingsSection('kubeconfig', {
                          externalPaths: updatedPaths
                        });

                        toast({
                          title: "Path removed",
                          description: "External path has been removed successfully.",
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
                    }}
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
          <Button
            variant="outline"
            onClick={handleAddFolder}
          >
            <FolderPlus size={16} className="mr-2" />
            Add Folder
          </Button>
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

      {/* Context Extension Section */}
      {/* <div className="mb-10">
        <h2 className="text-xl font-medium mb-4">Context Extension</h2>
        
        <div className="flex items-start mb-4">
          <input 
            type="checkbox" 
            id="regionExtension" 
            checked={contextRegionExtension}
            onChange={() => {
              setContextRegionExtension(!contextRegionExtension);
              saveKubeconfigSettings();
            }}
            className="mt-1 mr-3"
          />
          <div>
            <label htmlFor="regionExtension" className="font-medium cursor-pointer">Enable Region Extension</label>
            <p className="text-gray-700 dark:text-gray-400 text-xs mt-1">
              Automatically detect and group contexts by region.
            </p>
          </div>
        </div>
        
        <p className="text-gray-700 dark:text-gray-400 text-xs mb-1">
          You can group, re-order and customize contexts icons, with more configuration coming soon.
        </p>
        <p className="text-gray-700 dark:text-gray-400 text-xs mb-1">
          - Group contexts with tags and connect to multiple clusters quicker.
        </p>
        <p className="text-gray-700 dark:text-gray-400 text-xs mb-4">
          - Custom icons are useful to identify cluster location or environment.
        </p>
        
        <p className="text-gray-700 dark:text-gray-400 text-xs mb-6">
          Read our guide on <a href="#" className="text-blue-400 hover:underline">Context Extension</a> to learn more.
        </p>

        <div className="space-y-4">
          <div className="flex items-center">
            <div className="bg-blue-900 rounded-full p-2 mr-3">
              <div className="bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center">
                <span className="text-white text-xs">⚙️</span>
              </div>
            </div>
            <div>
              <div className="text-white">us-production</div>
              <div className="text-gray-500 text-sm">eks-us-east</div>
            </div>
          </div>
          
          <div className="flex items-center">
            <div className="bg-blue-900 rounded-full p-2 mr-3">
              <div className="bg-blue-500 rounded-full w-6 h-6 flex items-center justify-center">
                <span className="text-white text-xs">⚙️</span>
              </div>
            </div>
            <div>
              <div className="text-white">eu-production</div>
              <div className="text-gray-500 text-sm">eks-eu-west</div>
            </div>
            
            <ArrowRight className="mx-6 text-gray-500" size={20} />
            
            <div className="flex items-center bg-gray-800 rounded-lg px-4 py-2 border border-gray-700">
              <div className="flex items-center justify-center w-6 h-6 bg-transparent mr-2">
                <img src="https://via.placeholder.com/20" alt="US Flag" className="rounded-full" />
              </div>
              <div>
                <div className="text-white">Production</div>
                <div className="text-gray-500 text-sm">2 contexts</div>
              </div>
            </div>
          </div>
        </div>
      </div> */}

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