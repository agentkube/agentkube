import React, { useState, useRef, useCallback } from 'react';
import { Plus, X, RotateCcw, ChevronDown, ChevronUp, Folder, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CustomMonacoEditor } from '@/components/custom';
import { toast } from '@/hooks/use-toast';
import { yamlToJson } from '@/utils/yaml';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { useReconMode } from '@/contexts/useRecon';
import { kubeProxyRequest } from '@/api/cluster';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { TEMPLATE_CATEGORIES, GITHUB_BASE_URL, TemplateItem } from '@/constants/templates.constant';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ResourceTab {
  id: string;
  name: string;
  content: string;
  resourceType: string;
  apiGroup: string;
  apiVersion: string;
}

interface MiniEditorProps {
  isOpen: boolean;
  onToggle: () => void;
  currentResourceType?: string | null;
}

export const MiniEditor = ({ isOpen, onToggle, currentResourceType }: MiniEditorProps) => {
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [resourceTabs, setResourceTabs] = useState<ResourceTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isTabDropdownOpen, setIsTabDropdownOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);
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

  // Get current active tab
  const getCurrentTab = (): ResourceTab | null => {
    return resourceTabs.find(tab => tab.id === activeTabId) || null;
  };

  const handleEditorChange = (value: string | undefined): void => {
    if (value !== undefined && activeTabId) {
      // Extract resource metadata from the YAML
      const metadata = extractResourceMetadata(value);
      const { resourceType, apiGroup, apiVersion, kind, name } = metadata;

      // Update tab with new content and metadata
      setResourceTabs(tabs => tabs.map(tab =>
        tab.id === activeTabId ? {
          ...tab,
          content: value,
          resourceType,
          apiGroup,
          apiVersion,
          // Optionally update tab name if resource name is defined and tab name is default
          name: name && tab.name.startsWith('resource') ?
            `${name}.yaml` : tab.name
        } : tab
      ));
    }
  };

  const handleClear = () => {
    if (activeTabId) {
      setResourceTabs(tabs => tabs.map(tab =>
        tab.id === activeTabId ? { ...tab, content: '' } : tab
      ));
    }
  };

  // Create a new tab
  const addNewTab = (resourceType?: string, templateContent?: string): string => {
    const newTabId = `tab-${Date.now()}`;
    const template = resourceType ? findTemplateForResourceType(resourceType) : null;

    const newTab: ResourceTab = {
      id: newTabId,
      name: template ? `${template.name.toLowerCase()}.yaml` : `resource${resourceTabs.length + 1}.yaml`,
      content: templateContent || '',
      resourceType: resourceType || '',
      apiGroup: '',
      apiVersion: '',
    };

    setResourceTabs(tabs => [...tabs, newTab]);
    setActiveTabId(newTabId);
    return newTabId;
  };

  // Remove a tab
  const removeTab = (tabId: string) => {
    setResourceTabs(tabs => {
      const newTabs = tabs.filter(tab => tab.id !== tabId);

      // If we're removing the active tab, switch to another tab or none
      if (activeTabId === tabId) {
        if (newTabs.length > 0) {
          const currentIndex = tabs.findIndex(tab => tab.id === tabId);
          const nextTab = newTabs[Math.min(currentIndex, newTabs.length - 1)];
          setActiveTabId(nextTab.id);
        } else {
          setActiveTabId(null);
        }
      }

      return newTabs;
    });
  };

  // Switch to a specific tab
  const switchToTab = (tabId: string) => {
    setActiveTabId(tabId);
    setIsTabDropdownOpen(false);
  };

  // Find template for current resource type
  const findTemplateForResourceType = (resourceType: string): TemplateItem | null => {
    for (const category of TEMPLATE_CATEGORIES) {
      const template = category.items.find(item => item.resourceType === resourceType);
      if (template) {
        return template;
      }
    }
    return null;
  };

  // Get tooltip text based on current resource type
  const getTooltipText = (): string => {
    if (currentResourceType) {
      const template = findTemplateForResourceType(currentResourceType);
      if (template) {
        return `Create ${template.name}`;
      }
      // Fallback for resource types without specific templates
      const resourceName = currentResourceType.charAt(0).toUpperCase() + currentResourceType.slice(1, -1); // Remove 's' and capitalize
      return `Create ${resourceName}`;
    }
    return 'Create Resource';
  };

  // Fetch template content and create tab with it (for auto-loading)
  const fetchTemplateAndCreateTab = async (template: TemplateItem, resourceType: string) => {
    setIsTemplateLoading(true);
    
    try {
      const response = await fetch(`${GITHUB_BASE_URL}/${template.path}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const templateContent = await response.text();
      
      // Create tab with template content directly
      addNewTab(resourceType, templateContent);
      
      toast({
        title: "Template Applied",
        description: `${template.name} template applied to editor`,
        variant: "success"
      });
    } catch (error) {
      console.error(`Error fetching template content for ${template.path}:`, error);
      toast({
        title: "Error",
        description: `Failed to load template: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
    } finally {
      setIsTemplateLoading(false);
    }
  };

  // Auto-load template when editor opens and resource type is detected
  React.useEffect(() => {
    if (isOpen && currentResourceType) {
      // Check if we already have a tab for this resource type
      const existingTab = resourceTabs.find(tab => tab.resourceType === currentResourceType);

      if (existingTab) {
        // Switch to existing tab
        setActiveTabId(existingTab.id);
      } else {
        // Create new tab with template content directly
        const template = findTemplateForResourceType(currentResourceType);
        if (template) {
          fetchTemplateAndCreateTab(template, currentResourceType);
        }
      }
    }
  }, [isOpen, currentResourceType]);

  // Handle template selection
  const handleTemplateSelect = async (template: TemplateItem) => {
    setIsTemplateLoading(true);

    try {
      const response = await fetch(`${GITHUB_BASE_URL}/${template.path}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const templateContent = await response.text();

      // If no active tab, create one
      if (!activeTabId) {
        addNewTab(template.resourceType, templateContent);
      } else {
        // Update current tab content and metadata
        setResourceTabs(tabs => tabs.map(tab =>
          tab.id === activeTabId ? { 
            ...tab, 
            content: templateContent,
            resourceType: template.resourceType || '',
            name: template.name ? `${template.name.toLowerCase()}.yaml` : tab.name
          } : tab
        ));
      }

      toast({
        title: "Template Applied",
        description: `${template.name} template applied to editor`,
        variant: "success"
      });
    } catch (error) {
      console.error(`Error fetching template content for ${template.path}:`, error);
      toast({
        title: "Error",
        description: `Failed to load template: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
    } finally {
      setIsTemplateLoading(false);
    }
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

    const currentTab = getCurrentTab();
    if (!currentTab || !currentTab.content.trim()) {
      toast({
        title: "Error",
        description: "Resource definition is empty",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      const jsonContent = yamlToJson(currentTab.content);

      if (!jsonContent) {
        throw new Error("Invalid YAML content");
      }

      if (!jsonContent.kind || !jsonContent.apiVersion) {
        throw new Error("Resource must have 'kind' and 'apiVersion' fields");
      }

      if (!jsonContent.metadata || !jsonContent.metadata.name) {
        throw new Error("Resource must have 'metadata.name' field");
      }

      const metadata = extractResourceMetadata(currentTab.content);

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
    <TooltipProvider>
      {/* Floating Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            onClick={onToggle}
            className={`fixed bottom-8 right-4 w-14 h-14 rounded-full shadow-lg hover:shadow-xl backdrop-blur-md  transition-all duration-300 z-40 ${isOpen ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 dark:bg-[#0B0D13]/30 hover:bg-blue-600'
              }`}
            size="icon"
          >
            <Plus
              className={`h-8 w-8 transition-transform duration-300 ${isOpen ? 'rotate-45' : 'rotate-0'
                }`}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" className="px-3 py-2">
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>

      {/* Expandable Container */}
      {isOpen && (
        <div
          className="fixed bottom-24 dark:text-gray-300/80 right-8 w-1/2 bg-white dark:bg-[#0B0D13]/20 backdrop-blur-lg border border-gray-200 dark:border-gray-700/50 rounded-xl shadow-2xl z-40 animate-in slide-in-from-bottom-4 duration-300"
          style={{ height: editorHeight }}
        >
          {/* Resize Handle */}
          <div
            ref={resizeRef}
            className={`absolute top-0 left-0 right-0 h-1 cursor-ns-resize flex items-center justify-center group ${isDragging ? '' : ''
              }`}
            onMouseDown={handleMouseDown}
          />
          {/* <GripVertical className="h-3 w-3 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" /> */}


          <div className="flex flex-col h-full ">
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-gray-200 dark:border-gray-700/50">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-light text-gray-900 dark:text-gray-400/60">Editor</h3>

                {/* Tab Dropdown */}
                {resourceTabs.length > 0 && (
                  <DropdownMenu open={isTabDropdownOpen} onOpenChange={setIsTabDropdownOpen}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                          >
                            {isTabDropdownOpen ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="px-2 py-1">
                        <p className="text-xs">Tabs</p>
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="start" className="w-64 max-h-80 overflow-y-auto dark:bg-[#0B0D13]/50 backdrop-blur-xl">
                      {resourceTabs.map((tab) => (
                        <DropdownMenuItem
                          key={tab.id}
                          onClick={() => switchToTab(tab.id)}
                          className={`flex items-center justify-between p-2 ${activeTabId === tab.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-xs truncate">{tab.name}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {tab.resourceType || 'Unknown resource'}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 ml-2 hover:bg-red-100 dark:hover:bg-red-900/20"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTab(tab.id);
                            }}
                          >
                            <X className="h-3 w-3 text-gray-500 hover:text-red-500" />
                          </Button>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      // size="sm"
                      className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                      onClick={() => addNewTab()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="px-2 py-1">
                    <p className="text-xs">New Tab</p>
                  </TooltipContent>
                </Tooltip>

                {/* Template Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      // size="sm"
                      className="h-8 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                      disabled={isTemplateLoading}
                    >
                      {isTemplateLoading ? (
                        'Loading...'
                      ) : (
                        <>
                          <Folder className="h-3 w-3 mr-1" />
                          Templates
                          <ChevronDown className="h-3 w-3 ml-1" />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 max-h-80 dark:bg-[#0B0D13]/40 overflow-y-auto">
                    {TEMPLATE_CATEGORIES.map((category) => (
                      <DropdownMenuSub key={category.name} >
                        <DropdownMenuSubTrigger className='backdrop-blur-md'>
                          <Folder className="h-4 w-4 mr-2 text-blue-500" />
                          {category.displayName}
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="w-56 dark:bg-[#0B0D13]/40 backdrop-blur-md border-none">
                          {category.items.map((template) => (
                            <DropdownMenuItem
                              key={template.path}
                              onClick={() => handleTemplateSelect(template)}
                              className="flex items-center gap-2 p-2"
                            >
                              {template.icon ? (
                                <img
                                  src={template.icon}
                                  alt={template.name}
                                  width={16}
                                  height={16}
                                  className="object-contain mt-0.5 flex-shrink-0 h-4 w-4"
                                />
                              ) : (
                                <Folder className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{template.name}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {template.description}
                                </div>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>


                <Button
                  variant="ghost"
                  className="h-8 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  onClick={handleSave}
                  disabled={isSaving || !getCurrentTab()}
                >
                  {isSaving ? 'Creating...' : <><Save className="h-4 w-4 mr-2" /> Save</>}
                </Button>
                <Button
                  variant="ghost"
                  className="h-4 w-6 ml-2 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                  onClick={handleClear}
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  onClick={onToggle}
                  variant="ghost"
                  size="sm"
                  className="h-4 w-6 p-0 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden rounded-b-xl">
              <CustomMonacoEditor
                value={getCurrentTab()?.content || ''}
                onChange={handleEditorChange}
                theme={editorTheme}
                height={`${editorHeight - 42}px`}
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
    </TooltipProvider>
  );
};