import React, { useState, useRef, useCallback } from 'react';
import { Plus, X, GripVertical, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomMonacoEditor } from '@/components/custom';
import { toast } from '@/hooks/use-toast';
import { yamlToJson } from '@/utils/yaml';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { useReconMode } from '@/contexts/useRecon';
import { kubeProxyRequest } from '@/api/cluster';

interface MiniEditorProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const MiniEditor = ({ isOpen, onToggle }: MiniEditorProps) => {
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [content, setContent] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [editorHeight, setEditorHeight] = useState<number>(() => {
    const cached = localStorage.getItem('mini_editor_height');
    return cached ? parseInt(cached) : 384; // Default h-96 (24rem = 384px)
  });
  const [editorTheme, setEditorTheme] = useState<string>(() => {
    const cached = localStorage.getItem('editor_theme');
    return cached || 'github-dark';
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const resizeRef = useRef<HTMLDivElement>(null);

  const handleEditorChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setContent(value);
    }
  };

  const handleClear = () => {
    setContent('');
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const containerBottom = window.innerHeight - 96; // Account for button position
    const newHeight = Math.max(200, Math.min(containerBottom - e.clientY, window.innerHeight * 0.8));
    
    setEditorHeight(newHeight);
    localStorage.setItem('mini_editor_height', newHeight.toString());
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Attach global mouse events
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Extract resource metadata from YAML content (same as main editor)
  const extractResourceMetadata = (yamlContent: string) => {
    let result = {
      resourceType: '',
      apiGroup: '',
      apiVersion: '',
      kind: '',
      name: ''
    };

    try {
      if (!yamlContent.trim()) {
        return result;
      }

      const jsonContent = yamlToJson(yamlContent);

      if (jsonContent) {
        const apiVersion = jsonContent.apiVersion || '';
        const kind = jsonContent.kind || '';
        const name = jsonContent.metadata?.name || '';

        let group = '', version = '';
        if (apiVersion.includes('/')) {
          [group, version] = apiVersion.split('/');
        } else {
          group = '';
          version = apiVersion;
        }

        let resourceType = '';
        if (kind) {
          switch (kind.toLowerCase()) {
            case 'ingress':
              resourceType = 'ingresses';
              break;
            case 'networkpolicy':
              resourceType = 'networkpolicies';
              break;
            case 'ingressclass':
              resourceType = 'ingressclasses';
              break;
            case 'endpoints':
              resourceType = 'endpoints';
              break;
            default:
              resourceType = kind.toLowerCase() + 's';
          }
        }

        result = {
          resourceType,
          apiGroup: group,
          apiVersion: version,
          kind,
          name
        };
      }
    } catch (error) {
      console.error('Error extracting resource metadata:', error);
    }

    return result;
  };

  const handleSave = async (): Promise<void> => {
    if (isReconMode) {
      toast({
        title: "Recon Mode",
        description: "This action can't be performed while recon mode is on. Disable recon mode to proceed.",
        variant: "recon"
      });
      return;
    }
    
    if (!currentContext?.name) {
      toast({
        title: "Error",
        description: "No cluster context selected",
        variant: "destructive"
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: "Error",
        description: "Resource definition is empty",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const jsonContent = yamlToJson(content);

      if (!jsonContent) {
        throw new Error("Invalid YAML content");
      }

      if (!jsonContent.kind || !jsonContent.apiVersion) {
        throw new Error("Resource must have 'kind' and 'apiVersion' fields");
      }

      if (!jsonContent.metadata || !jsonContent.metadata.name) {
        throw new Error("Resource must have 'metadata.name' field");
      }

      const metadata = extractResourceMetadata(content);

      const clusterScopedResources = [
        'namespaces',
        'nodes',
        'persistentvolumes',
        'clusterroles',
        'clusterrolebindings',
        'customresourcedefinitions',
        'podsecuritypolicies',
        'storageclasses',
        'ingressclasses'
      ];

      const isNamespaced = !clusterScopedResources.includes(metadata.resourceType);

      const namespace = isNamespaced ?
        (jsonContent.metadata.namespace || (selectedNamespaces.length > 0 ? selectedNamespaces[0] : undefined)) :
        undefined;

      if (isNamespaced && !namespace) {
        toast({
          title: "Error",
          description: "Namespace required for this resource type. Please select a namespace or specify it in YAML.",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }

      const apiPath = metadata.apiGroup
        ? `apis/${metadata.apiGroup}/${metadata.apiVersion}`
        : `api/${metadata.apiVersion}`;

      const resourcePath = namespace
        ? `${apiPath}/namespaces/${namespace}/${metadata.resourceType}`
        : `${apiPath}/${metadata.resourceType}`;

      await kubeProxyRequest(currentContext.name, resourcePath, 'POST', jsonContent);

      toast({
        title: "Success",
        description: `Resource created successfully`,
        variant: "success"
      });

    } catch (error) {
      console.error(`Error creating resource:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to create resource`,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <Button
        onClick={onToggle}
        className={`fixed bottom-8 right-4 w-14 h-14 rounded-full shadow-lg hover:shadow-xl backdrop-blur-md  transition-all duration-300 z-40 ${
          isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 dark:bg-[#0B0D13]/30 hover:bg-blue-600'
        }`}
        size="icon"
      >
        <Plus
          className={`h-8 w-8 transition-transform duration-300 ${
            isOpen ? 'rotate-45' : 'rotate-0'
          }`} 
        />
      </Button>

      {/* Expandable Container */}
      {isOpen && (
        <div 
          className="fixed bottom-24 right-8 w-1/2 bg-white dark:bg-[#0B0D13]/20 backdrop-blur-lg border border-gray-200 dark:border-gray-700/50 rounded-xl shadow-2xl z-40 animate-in slide-in-from-bottom-4 duration-300"
          style={{ height: editorHeight }}
        >
          {/* Resize Handle */}
          <div 
            ref={resizeRef}
            className={`absolute top-0 left-0 right-0 h-1 cursor-ns-resize flex items-center justify-center group ${
              isDragging ? '' : ''
            }`}
            onMouseDown={handleMouseDown}
          />
            {/* <GripVertical className="h-3 w-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" /> */}


          <div className="flex flex-col h-full ">
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-gray-700/50">
              <h3 className="text-sm font-light text-gray-900 dark:text-gray-400/60">Editor</h3>
              <div className="flex items-center gap-1">
            
                <Button 
                  size="sm"
                  
                  className="h-8 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? 'Creating...' : <><Plus className="h-4 w-4 mr-2" /> Create Resource</>}
                </Button>
                <Button 
                  variant="ghost"
                  size="sm"
                  className="h-4 w-6 ml-2 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  onClick={handleClear}
                >
                  <RotateCcw className="h-3 w-3 text-gray-600 dark:text-gray-300" />
                </Button>
                <Button
                  onClick={onToggle}
                  variant="ghost"
                  size="sm"
                  className="h-4 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                >
                  <X className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                </Button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden rounded-b-xl">
              <CustomMonacoEditor
                value={content}
                onChange={handleEditorChange}
                theme={editorTheme}
              />
            </div>

          </div>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30"
          onClick={onToggle}
        />
      )}
    </>
  );
};