import React, { useState, useEffect } from 'react';
import { Save, Loader2, Plus, X, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { getSettings } from '@/api/settings';
import { useToast } from '@/hooks/use-toast';

interface ImageScanSettings {
  enable: boolean;
  exclusions: {
    namespaces: string[];
    labels: Record<string, string>;
  };
}

const ImageScans: React.FC = () => {
  const { toast } = useToast();
  
  // State for settings
  const [imageScansEnabled, setImageScansEnabled] = useState<boolean>(false);
  const [excludedNamespaces, setExcludedNamespaces] = useState<string[]>([]);
  const [excludedLabels, setExcludedLabels] = useState<Record<string, string>>({});
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form inputs for adding new exclusions
  const [newNamespace, setNewNamespace] = useState('');
  const [newLabelKey, setNewLabelKey] = useState('');
  const [newLabelValue, setNewLabelValue] = useState('');

  // Fetch settings on component mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setIsLoading(true);
        // TODO: Replace with actual API call when imageScans endpoint is implemented
        // const settings = await getSettings();
        
        // Mock data for now - remove when API is ready
        const imageScansConfig = {
          enable: false,
          exclusions: { namespaces: [], labels: {} }
        };

        setImageScansEnabled(imageScansConfig.enable ?? false);
        setExcludedNamespaces(imageScansConfig.exclusions?.namespaces ?? []);
        setExcludedLabels(imageScansConfig.exclusions?.labels ?? {});

      } catch (error) {
        console.error('Failed to load image scan settings:', error);
        toast({
          title: "Error loading settings",
          description: "Could not load image scan settings. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [toast]);

  // Handle adding new namespace exclusion
  const handleAddNamespace = () => {
    if (newNamespace.trim() && !excludedNamespaces.includes(newNamespace.trim())) {
      setExcludedNamespaces([...excludedNamespaces, newNamespace.trim()]);
      setNewNamespace('');
    }
  };

  // Handle removing namespace exclusion
  const handleRemoveNamespace = (namespace: string) => {
    setExcludedNamespaces(excludedNamespaces.filter(ns => ns !== namespace));
  };

  // Handle adding new label exclusion
  const handleAddLabel = () => {
    if (newLabelKey.trim() && newLabelValue.trim()) {
      setExcludedLabels({
        ...excludedLabels,
        [newLabelKey.trim()]: newLabelValue.trim()
      });
      setNewLabelKey('');
      setNewLabelValue('');
    }
  };

  // Handle removing label exclusion
  const handleRemoveLabel = (key: string) => {
    const updatedLabels = { ...excludedLabels };
    delete updatedLabels[key];
    setExcludedLabels(updatedLabels);
  };

  // Handle keyboard events for adding exclusions
  const handleNamespaceKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddNamespace();
    }
  };

  const handleLabelKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddLabel();
    }
  };

  // Handle settings save
  const handleSaveSettings = async () => {
    try {
      setIsSaving(true);

      // TODO: Replace with actual API call when imageScans endpoint is implemented
      // const imageScansConfig: ImageScanSettings = {
      //   enable: imageScansEnabled,
      //   exclusions: {
      //     namespaces: excludedNamespaces,
      //     labels: excludedLabels
      //   }
      // };
      // await updateSettingsSection('imageScans', imageScansConfig);

      // Mock success for now - remove when API is ready
      console.log('Would save:', {
        enable: imageScansEnabled,
        exclusions: {
          namespaces: excludedNamespaces,
          labels: excludedLabels
        }
      });

      toast({
        title: "Settings saved",
        description: "Your image scan settings have been updated successfully.",
      });
    } catch (error) {
      console.error('Failed to save image scan settings:', error);
      toast({
        title: "Error saving settings",
        description: "Could not save your image scan settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading image scan settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">Image Scans</h1>
        <p className="text-gray-500 dark:text-gray-400">Configure container image vulnerability scanning</p>
      </div>

      <div className="space-y-6">
        {/* Enable Image Scans */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="enable-scans" className="block">Enable Image Scans</Label>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Automatically scan container images for security vulnerabilities
            </p>
          </div>
          <Switch
            id="enable-scans"
            checked={imageScansEnabled}
            onCheckedChange={setImageScansEnabled}
          />
        </div>

        {/* Security Notice */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Security Scanning
              </h3>
              <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                Image scanning helps identify known vulnerabilities in your container images. 
                Configure exclusions below to skip scanning for specific namespaces or labeled resources.
              </p>
            </div>
          </div>
        </div>

        {/* Exclusions Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Exclusions</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Configure which resources to exclude from image scanning
            </p>
          </div>

          {/* Namespace Exclusions */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="namespace-exclusions">Excluded Namespaces</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Images in these namespaces will be excluded from scanning
              </p>
            </div>
            
            {/* Display existing excluded namespaces */}
            {excludedNamespaces.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {excludedNamespaces.map((namespace) => (
                  <Badge
                    key={namespace}
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    {namespace}
                    <button
                      onClick={() => handleRemoveNamespace(namespace)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Add new namespace */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter namespace name"
                value={newNamespace}
                onChange={(e) => setNewNamespace(e.target.value)}
                onKeyPress={handleNamespaceKeyPress}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddNamespace}
                disabled={!newNamespace.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Label Exclusions */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="label-exclusions">Excluded Labels</Label>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Resources with these labels will be excluded from scanning
              </p>
            </div>
            
            {/* Display existing excluded labels */}
            {Object.keys(excludedLabels).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(excludedLabels).map(([key, value]) => (
                  <Badge
                    key={key}
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    <span className="font-mono text-xs">{key}={value}</span>
                    <button
                      onClick={() => handleRemoveLabel(key)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Add new label */}
            <div className="flex gap-2">
              <Input
                placeholder="Label key"
                value={newLabelKey}
                onChange={(e) => setNewLabelKey(e.target.value)}
                onKeyPress={handleLabelKeyPress}
                className="flex-1"
              />
              <Input
                placeholder="Label value"
                value={newLabelValue}
                onChange={(e) => setNewLabelValue(e.target.value)}
                onKeyPress={handleLabelKeyPress}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddLabel}
                disabled={!newLabelKey.trim() || !newLabelValue.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Warning for disabled scans */}
        {!imageScansEnabled && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-amber-900 dark:text-amber-100">
                  Image Scanning Disabled
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                  Container images will not be scanned for vulnerabilities. Enable image scanning to improve your cluster security posture.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          className="flex items-center gap-2"
          onClick={handleSaveSettings}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
};

export default ImageScans;