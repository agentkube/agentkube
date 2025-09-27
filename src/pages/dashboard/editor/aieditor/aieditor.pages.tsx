import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CustomMonacoEditor, SecurityReport, GuiResourceEditor } from '@/components/custom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sun,
  Moon,
  Save,
  Plus,
  X,
  Wand2,
  Shield,
  Code,
  LayoutGrid,
  Settings,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { jsonToYaml, yamlToJson } from '@/utils/yaml';
import { motion, AnimatePresence } from 'framer-motion';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { MisconfigurationReport } from '@/types/scanner/misconfiguration-report';
import { scanConfig } from '@/api/scanner/security';
import { ResourceTemplate } from '@/components/custom';
import { kubeProxyRequest } from '@/api/cluster';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Blur } from '@/assets/icons';
import { SiKubernetes } from '@icons-pack/react-simple-icons';
import { useReconMode } from '@/contexts/useRecon';

// Define type for resource tab
interface ResourceTab {
  id: string;
  name: string;
  content: string;
  resourceType: string;
  apiGroup: string;
  apiVersion: string;
}

const AIResourceEditor: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const { isReconMode } = useReconMode();
  const [securityReport, setSecurityReport] = useState<MisconfigurationReport | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);
  // State for managing multiple resource tabs
  const [resourceTabs, setResourceTabs] = useState<ResourceTab[]>([
    {
      id: 'tab-1',
      name: 'resource1.yaml',
      content: defaultYamlTemplate(),
      resourceType: '',
      apiGroup: '',
      apiVersion: ''
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  // Editor state
  const [editorTheme, setEditorTheme] = useState<string>(() => {
    const cached = localStorage.getItem('editor_theme');
    return cached || 'github-dark';
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);



  // State for sidebar visibility
  const [showSidebar, setShowSidebar] = useState<boolean>(false);


  // State for layout
  const [editorWidth, setEditorWidth] = useState<string>('100%');
  const isDragging = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('editor_theme', editorTheme);
  }, [editorTheme]);

  // Extract resource metadata from YAML content
  const extractResourceMetadata = (yamlContent: string) => {
    // Default values (empty)
    let result = {
      resourceType: '',
      apiGroup: '',
      apiVersion: '',
      kind: '',
      name: ''
    };

    try {
      // If content is empty, return defaults
      if (!yamlContent.trim()) {
        return result;
      }

      // Convert YAML to JSON to extract metadata
      const jsonContent = yamlToJson(yamlContent);

      if (jsonContent) {
        // Extract API version and kind
        const apiVersion = jsonContent.apiVersion || '';
        const kind = jsonContent.kind || '';
        const name = jsonContent.metadata?.name || '';

        // Parse API version to get group and version
        let group = '', version = '';
        if (apiVersion.includes('/')) {
          [group, version] = apiVersion.split('/');
        } else {
          group = '';  // Core API group
          version = apiVersion;
        }

        // Convert kind to plural resource type (lowercase + 's' suffix)
        // This is a simplified approach - actual k8s API can be more complex
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

        // Set the extracted values
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

  // Get active tab content
  const getActiveTab = (): ResourceTab => {
    return resourceTabs.find(tab => tab.id === activeTabId) || resourceTabs[0];
  };

  // Use the active tab's content for security scanning
  const handleSecurityScan = async () => {
    const activeTabContent = getActiveTab().content;

    if (!activeTabContent) {
      toast({
        title: "Error",
        description: "No YAML content to scan",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    try {
      const result = await scanConfig(activeTabContent);
      setSecurityReport(result);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to scan configuration",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Toggle editor theme
  const toggleTheme = (): void => {
    setEditorTheme(current => current === 'vs-dark' ? 'light' : 'vs-dark');
  };

  // Handle editor content change with metadata extraction
  const handleEditorChange = (value: string | undefined): void => {
    if (value !== undefined) {
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

  // Create a new tab (with no default resource type)
  const addNewTab = (): void => {
    const newTabId = `tab-${Date.now()}`;

    const newTab: ResourceTab = {
      id: newTabId,
      name: `resource${resourceTabs.length + 1}.yaml`,
      content: '',
      resourceType: '',
      apiGroup: '',
      apiVersion: ''
    };

    setResourceTabs([...resourceTabs, newTab]);
    setActiveTabId(newTabId);
  };

  // Close a tab
  const closeTab = (tabId: string, event: React.MouseEvent): void => {
    event.stopPropagation();

    if (resourceTabs.length === 1) {
      // Don't remove the last tab, just clear it
      setResourceTabs([{
        id: tabId,
        name: 'resource1.yaml',
        content: '',
        resourceType: '',
        apiGroup: '',
        apiVersion: ''
      }]);
      return;
    }

    const newTabs = resourceTabs.filter(tab => tab.id !== tabId);
    setResourceTabs(newTabs);

    // If the active tab was closed, activate another tab
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id);
    }
  };

  // Handle save (create resource)
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

    const activeTab = getActiveTab();

    // Validate content
    if (!activeTab.content.trim()) {
      toast({
        title: "Error",
        description: "Resource definition is empty",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);
    try {
      // Convert YAML to JSON
      const jsonContent = yamlToJson(activeTab.content);

      if (!jsonContent) {
        throw new Error("Invalid YAML content");
      }

      if (!jsonContent.kind || !jsonContent.apiVersion) {
        throw new Error("Resource must have 'kind' and 'apiVersion' fields");
      }

      if (!jsonContent.metadata || !jsonContent.metadata.name) {
        throw new Error("Resource must have 'metadata.name' field");
      }

      // Determine if this is a namespaced resource
      // This is a simplified check - in a real implementation you would check against a
      // comprehensive list of cluster-scoped resources or query the API server
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

      const isNamespaced = !clusterScopedResources.includes(activeTab.resourceType);

      // Use namespace from YAML or fallback to selected namespace
      const namespace = isNamespaced ?
        (jsonContent.metadata.namespace || (selectedNamespaces.length > 0 ? selectedNamespaces[0] : undefined)) :
        undefined;

      // If namespace is required but not provided
      if (isNamespaced && !namespace) {
        toast({
          title: "Error",
          description: "Namespace required for this resource type. Please select a namespace or specify it in YAML.",
          variant: "destructive"
        });
        setIsSaving(false);
        return;
      }

      const apiPath = activeTab.apiGroup
        ? `apis/${activeTab.apiGroup}/${activeTab.apiVersion}`
        : `api/${activeTab.apiVersion}`;

      const resourcePath = namespace
        ? `${apiPath}/namespaces/${namespace}/${activeTab.resourceType}`
        : `${apiPath}/${activeTab.resourceType}`;

      // Use kubeProxyRequest instead of the createResource function
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

  // Toggle assist sidebar
  const toggleAssist = useCallback((): void => {
    const newShowSidebar = !showSidebar;
    setShowSidebar(newShowSidebar);

    // Adjust editor width when sidebar is toggled
    if (newShowSidebar) {
      setEditorWidth('60%');
    } else {
      setEditorWidth('100%');
    }
  }, [showSidebar]);

  // Handle template selection with metadata extraction
  const handleTemplateSelect = async (templateContent: string, templateName: string) => {
    setIsTemplateLoading(true);

    try {
      // Extract metadata from the template
      const metadata = extractResourceMetadata(templateContent);
      const { resourceType, apiGroup, apiVersion, kind, name } = metadata;

      // Create filename based on template name or resource name
      const fileName = name ?
        `${name}.yaml` :
        templateName.toLowerCase().replace(/\s+/g, '-') + '.yaml';

      // Update the active tab with template content and metadata
      setResourceTabs(tabs => tabs.map(tab =>
        tab.id === activeTabId
          ? {
            ...tab,
            content: templateContent,
            name: fileName,
            resourceType,
            apiGroup,
            apiVersion
          }
          : tab
      ));

      toast({
        title: "Template Applied",
        description: `${templateName} template has been applied.`
      });
    } finally {
      setIsTemplateLoading(false);
    }
  };


  const handleGuiUpdate = (yaml: string): void => {
    // Extract metadata from the updated YAML
    const metadata = extractResourceMetadata(yaml);
    const { resourceType, apiGroup, apiVersion } = metadata;

    setResourceTabs(tabs => tabs.map(tab =>
      tab.id === activeTabId ? {
        ...tab,
        content: yaml,
        resourceType,
        apiGroup,
        apiVersion
      } : tab
    ));

    toast({
      title: "YAML Generated",
      description: "Resource configuration has been updated",
      variant: "success"
    });
  };

  // Resizer logic with hover handling
  const handleMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent): void => {
    if (!isDragging.current || !containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    // Limit the minimum and maximum widths
    if (newWidth >= 30 && newWidth <= 85) {
      setEditorWidth(`${newWidth}%`);
    }
  };

  const handleMouseUp = (): void => {
    isDragging.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = '';
  };

  // Keyboard shortcut for toggling assist panel (Cmd+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Check for Cmd+B (Mac) or Ctrl+B (Windows)
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleAssist();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toggleAssist]);

  // Clean up event listeners
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Default YAML template (empty)
  function defaultYamlTemplate(): string {
    return '';
  }

  return (
    <div className="h-full w-full relative
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
          flex flex-col">

      {/* Header/Toolbar */}
      <div className="border-b p-4 flex-shrink-0 z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl uppercase font-[Anton] font-bold text-gray-800 dark:text-gray-700/80">Editor</h1>

          <div className="space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showSidebar ? "default" : "outline"}
                    onClick={toggleAssist}
                    className="relative text-black dark:text-gray-300 bg-gray-50 hover:bg-gray-200 dark:hover:bg-gray-800"
                  >
                    <Wand2 className="h-4 w-4 mr-2" /> Assist
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="p-1">
                  <p>Toggle AI Assistant (⌘+B)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Creating...' : <><Plus className="h-4 w-4 mr-2" /> Create Resource</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex relative overflow-hidden">
        <div ref={containerRef} className="flex w-full h-full overflow-hidden">
          {/* Editor Container */}
          <motion.div
            style={{ width: editorWidth }}
            animate={{ width: editorWidth }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex flex-col h-full"
          >
            {/* Tabs Row */}
            <div className={`flex border-b ${editorTheme !== 'vs-dark' ? 'border-gray-700 bg-[#1e1e1e]' : 'border-gray-200 bg-white'}`}>
              <div className="flex-1 flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400">
                {resourceTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`flex items-center overflow-x-auto px-4 py-1 border-r cursor-pointer ${editorTheme !== 'vs-dark' ? 'border-gray-700' : 'border-gray-200'
                      } ${activeTabId === tab.id
                        ? editorTheme !== 'vs-dark'
                          ? 'text-white bg-neutral-800/80'
                          : 'text-black bg-gray-100'
                        : editorTheme !== 'vs-dark'
                          ? 'text-gray-400 hover:bg-neutral-800'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                      <SiKubernetes className='h-3.5 w-3.5 mr-2' />
                    <span className="truncate max-w-[150px] text-xs"> 
                      {tab.name}
                    </span>
                    <button
                      className="ml-2 p-1 rounded-full text-gray-500 hover:text-gray-800 dark:hover:text-gray-300"
                      onClick={(e) => closeTab(tab.id, e)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                <button
                  onClick={addNewTab}
                  className={`px-2 py-1.5 flex items-center ${editorTheme !== 'vs-dark'
                    ? 'text-gray-400 hover:bg-neutral-800'
                    : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`p-2 ${editorTheme !== 'vs-dark'
                      ? 'text-gray-400 hover:bg-gray-500/10'
                      : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    <Blur />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className='dark:bg-[#0B0D13]/40 backdrop-blur-sm'>
                  {/* <DropdownMenuSeparator /> */}
                  <DropdownMenuItem onClick={() => navigate('/settings/appearance')}>
                    <Settings className="h-4 w-4 mr-2" />
                    More Themes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              <div className={`flex border-b ${editorTheme === 'vs-dark' || editorTheme === "hc-black" ? 'border-gray-700 bg-[#1e1e1e]' : 'border-gray-200 bg-white'}`}>
                <CustomMonacoEditor
                  value={getActiveTab().content}
                  onChange={handleEditorChange}
                  theme={editorTheme}
                />
              </div>
            </div>
          </motion.div>

          {/* Resizer - Only shown when sidebar is visible */}
          <AnimatePresence>
            {showSidebar && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`
                  flex items-center justify-center
                  relative select-none z-10
                  w-5 flex-shrink-0 cursor-col-resize
                  ${isResizing ? 'bg-blue-100 dark:bg-blue-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800/30'}
                  transition-colors duration-150
                `}
                onMouseDown={handleMouseDown}
              >
                <div className={`
                  h-8 w-1 rounded-full
                  ${isResizing ? 'bg-blue-400 dark:bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}
                  transition-colors duration-150
                `}></div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Right Panel - Only shown when sidebar is visible */}
          <AnimatePresence>
            {showSidebar && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "40%", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="border-l border-gray-200 dark:border-gray-800 h-full flex-grow overflow-hidden"
              >
                <div className="p-4 h-full w-full overflow-hidden flex flex-col">
                  <Tabs defaultValue="chat" className="w-full h-full flex flex-col ">
                    <TabsList className="mb-2 w-full flex-shrink-0 text-sm dark:bg-transparent">
                      <TabsTrigger value="chat" className="flex-1">
                        <Wand2 className="h-4 w-4 mr-2" /> Chat
                      </TabsTrigger>
                      <TabsTrigger value="security" className="flex-1">
                        <Shield className="h-4 w-4 mr-2" /> Security
                      </TabsTrigger>
                      <TabsTrigger value="template" className="flex-1">
                        <Code className="h-4 w-4 mr-2" /> Template
                      </TabsTrigger>
                      <TabsTrigger value="gui" className="flex-1">
                        <LayoutGrid className="h-4 w-4 mr-2" /> GUI
                      </TabsTrigger>
                    </TabsList>

                    {/* Chat Panel - Now handled by main right drawer */}
                    <TabsContent value="chat" className="flex-1 w-full overflow-hidden">
                      <div className="bg-gray-100 dark:bg-transparent border border-gray-300 dark:border-gray-700 rounded-lg p-6 h-full w-full flex items-center justify-center">
                        <div className="text-center">
                          <Wand2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">AI Assistant</h3>
                          <p className="text-gray-500 dark:text-gray-400 mt-2">Use Cmd+L to open the main AI assistant, or select code and use Cmd+K to ask about it</p>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Security Panel */}
                    <TabsContent value="security" className="flex-1 w-full overflow-auto">
                      <SecurityReport
                        yamlContent={getActiveTab().content}
                        report={securityReport}
                        isScanning={isScanning}
                        onScan={handleSecurityScan}
                      />
                    </TabsContent>

                    {/* Template Panel */}
                    <TabsContent value="template" className="flex-1 w-full overflow-auto">
                      <ResourceTemplate onSelectTemplate={handleTemplateSelect} />
                    </TabsContent>

                    {/* GUI Panel */}
                    <TabsContent value="gui" className="flex-1 w-full overflow-auto">
                      <div className="bg-gray-100 dark:bg-gray-900/30 border border-gray-300 dark:border-gray-700 rounded-lg p-6 h-full w-full flex items-center justify-center">
                        <div className="text-center">
                          <LayoutGrid className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                          <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Visual Editor</h3>
                          <p className="text-gray-500 dark:text-gray-400 mt-2">Visual resource editor coming soon</p>
                          <Button variant="outline" className="mt-4">Try Preview</Button>
                        </div>
                      </div>
                      {/* <GuiResourceEditor onUpdateYaml={handleGuiUpdate} />  */}
                    </TabsContent>
                  </Tabs>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default AIResourceEditor;