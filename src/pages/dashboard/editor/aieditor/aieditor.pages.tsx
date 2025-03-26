import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CustomMonacoEditor, ChatPanel, SecurityReport, GuiResourceEditor } from '@/components/custom';
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
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { jsonToYaml, yamlToJson } from '@/utils/yaml';
import { createResource } from '@/api/internal/resources';
import { ChatMessage } from '@/types/chat';
import { motion, AnimatePresence } from 'framer-motion';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { MisconfigurationReport } from '@/types/scanner/misconfiguration-report';
import { scanConfig } from '@/api/scanner/security';
import { ResourceTemplate } from '@/components/custom';
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
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [securityReport, setSecurityReport] = useState<MisconfigurationReport | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);

  // State for managing multiple resource tabs
  const [resourceTabs, setResourceTabs] = useState<ResourceTab[]>([
    {
      id: 'tab-1',
      name: 'resource1.yaml',
      content: defaultYamlTemplate(),
      resourceType: 'deployments',
      apiGroup: 'apps',
      apiVersion: 'v1'
    }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  // Editor state
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // State for sidebar visibility
  const [showSidebar, setShowSidebar] = useState<boolean>(false);

  // State for chat
  const [question, setQuestion] = useState<string>('');
  const [chatResponse, setChatResponse] = useState<string>('');
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatResponseRef = useRef<string>('');

  // State for layout
  const [editorWidth, setEditorWidth] = useState<string>('100%');
  const isDragging = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isResizing, setIsResizing] = useState<boolean>(false);

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

  // Handle editor content change
  const handleEditorChange = (value: string | undefined): void => {
    if (value !== undefined) {
      setResourceTabs(tabs => tabs.map(tab =>
        tab.id === activeTabId ? { ...tab, content: value } : tab
      ));
    }
  };

  // Create a new tab
  const addNewTab = (): void => {
    const newTabId = `tab-${Date.now()}`;
    const newTab: ResourceTab = {
      id: newTabId,
      name: `resource${resourceTabs.length + 1}.yaml`,
      content: '',
      resourceType: 'deployments',
      apiGroup: 'apps',
      apiVersion: 'v1'
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
        content: defaultYamlTemplate(),
        resourceType: 'deployments',
        apiGroup: 'apps',
        apiVersion: 'v1'
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

  // Handle rename of tab
  // const renameTab = (tabId: string, newName: string): void => {
  //   setResourceTabs(tabs => tabs.map(tab =>
  //     tab.id === tabId ? { ...tab, name: newName } : tab
  //   ));
  // };

  // Handle save (create resource)
  const handleSave = async (): Promise<void> => {
    if (!currentContext?.name) {
      toast({
        title: "Error",
        description: "No cluster context selected",
        variant: "destructive"
      });
      return;
    }

    if (selectedNamespaces.length === 0) {
      toast({
        title: "Error",
        description: "Please select a namespace",
        variant: "destructive"
      });
      return;
    }

    const activeTab = getActiveTab();

    setIsSaving(true);
    try {
      // Convert YAML to JSON
      const jsonContent = yamlToJson(activeTab.content);

      // Create the resource
      await createResource(
        currentContext.name,
        activeTab.resourceType,
        jsonContent,
        {
          namespace: selectedNamespaces[0], // Use the first selected namespace
          apiGroup: activeTab.apiGroup,
          apiVersion: activeTab.apiVersion
        }
      );

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

  const handleTemplateSelect = async (templateContent: string, templateName: string) => {
  setIsTemplateLoading(true);
  
  try {
    setResourceTabs(tabs => tabs.map(tab =>
      tab.id === activeTabId 
        ? { 
            ...tab, 
            content: templateContent,
            name: templateName.toLowerCase().replace(/\s+/g, '-') + '.yaml'
          } 
        : tab
    ));

    toast({
      title: "Template Applied",
      description: `${templateName} template has been applied.`,
      variant: "success"
    });
  } finally {
    setIsTemplateLoading(false);
  }
};

  // Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent | React.KeyboardEvent): Promise<void> => {
    e.preventDefault();
    if (!question.trim() || isChatLoading) return;

    setIsChatLoading(true);
    chatResponseRef.current = '';
    setChatResponse('');

    // Add user message to chat history
    const userMessage: ChatMessage = {
      role: 'user',
      content: question
    };
    setChatHistory(prev => [...prev, userMessage]);

    // Dummy response logic
    try {
      const activeTab = getActiveTab();
      const dummyResponse = getDummyResponse(question, activeTab.content);

      // Simulate typing effect for streaming
      let accumulatedResponse = '';
      const words = dummyResponse.split(' ');

      for (let i = 0; i < words.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 30)); // Simulate network delay
        accumulatedResponse += (i === 0 ? '' : ' ') + words[i];
        chatResponseRef.current = accumulatedResponse;
        setChatResponse(accumulatedResponse);
      }

      // Add assistant message to chat history
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: dummyResponse
      };

      setChatHistory(prev => [...prev, assistantMessage]);
      setIsChatLoading(false);
      setQuestion('');
      setChatResponse('');

    } catch (error) {
      console.error('Chat error:', error);
      setChatResponse('Error: Failed to get response');
      setIsChatLoading(false);
    }
  };

  const handleGuiUpdate = (yaml: string): void => {
    setResourceTabs(tabs => tabs.map(tab =>
      tab.id === activeTabId ? { ...tab, content: yaml } : tab
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

  // Helper function to generate dummy responses
  const getDummyResponse = (query: string, yamlContent: string): string => {
    const lowercaseQuery = query.toLowerCase();

    if (lowercaseQuery.includes('resource limit') || lowercaseQuery.includes('cpu') || lowercaseQuery.includes('memory')) {
      return "Based on your YAML, I recommend setting resource limits and requests explicitly for better pod scheduling. For example:\n\n```yaml\nresources:\n  limits:\n    cpu: 500m\n    memory: 512Mi\n  requests:\n    cpu: 200m\n    memory: 256Mi\n```\n\nThis ensures your container gets the resources it needs without consuming too much from the cluster.";
    }

    if (lowercaseQuery.includes('replica') || lowercaseQuery.includes('scale')) {
      return "Your current configuration has a fixed number of replicas. For better availability and scaling, consider using a Horizontal Pod Autoscaler (HPA):\n\n```yaml\napiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: your-deployment\nspec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: your-deployment\n  minReplicas: 2\n  maxReplicas: 10\n  metrics:\n  - type: Resource\n    resource:\n      name: cpu\n      target:\n        type: Utilization\n        averageUtilization: 80\n```";
    }

    if (lowercaseQuery.includes('health') || lowercaseQuery.includes('probe') || lowercaseQuery.includes('readiness')) {
      return "I notice your configuration might be missing health checks. Consider adding liveness and readiness probes for better reliability:\n\n```yaml\nlivenessProbe:\n  httpGet:\n    path: /health\n    port: 8080\n  initialDelaySeconds: 15\n  periodSeconds: 10\nreadinessProbe:\n  httpGet:\n    path: /ready\n    port: 8080\n  initialDelaySeconds: 5\n  periodSeconds: 10\n```";
    }

    // Default response
    return "I've examined your YAML configuration. It looks generally well-structured. Some areas you might want to consider reviewing:\n\n1. Resource limits and requests\n2. Health probes\n3. Security contexts\n4. Update strategy\n\nIs there a specific aspect you'd like me to help you improve?";
  };

  // Default YAML template for new resources
  function defaultYamlTemplate(): string {
    return '';
  }

  return (
    <div className="h-full w-full relative
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
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
            <Button
              variant={showSidebar ? "default" : "outline"}
              onClick={toggleAssist}
              className="relative text-black dark:text-gray-300 bg-gray-50 hover:bg-gray-200 dark:hover:bg-gray-800"
            >
              <Wand2 className="h-4 w-4 mr-2" /> Assist
              <span className="text-xs opacity-70 ml-1">(⌘+B)</span>
            </Button>

            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-blue-700 hover:bg-blue-800 text-white"
            >
              {isSaving ? 'Creating...' : <><Save className="h-4 w-4 mr-2" /> Create Resource</>}
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
            <div className={`flex border-b ${editorTheme === 'vs-dark' ? 'border-gray-700 bg-[#1e1e1e]' : 'border-gray-200 bg-white'}`}>
              <div className="flex-1 flex items-center overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400">
                {resourceTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`flex items-center overflow-x-auto px-4 py-2 border-r cursor-pointer ${editorTheme === 'vs-dark' ? 'border-gray-700' : 'border-gray-200'
                      } ${activeTabId === tab.id
                        ? editorTheme === 'vs-dark'
                          ? 'text-white bg-gray-800'
                          : 'text-black bg-gray-100'
                        : editorTheme === 'vs-dark'
                          ? 'text-gray-400 hover:bg-gray-800'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                  >
                    <span className="truncate max-w-[150px]">{tab.name}</span>
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
                  className={`p-2 flex items-center ${editorTheme === 'vs-dark'
                      ? 'text-gray-400 hover:bg-gray-800'
                      : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={toggleTheme}
                className={`p-2 ${editorTheme === 'vs-dark'
                    ? 'text-gray-400 hover:bg-gray-800'
                    : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                {editorTheme === 'vs-dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
              <div className={`h-full w-full ${editorTheme === 'vs-dark' ? 'bg-[#1e1e1e]' : 'bg-white'}`}>
                <CustomMonacoEditor
                  value={getActiveTab().content}
                  onChange={handleEditorChange}
                  theme={editorTheme}
                  setQuestion={setQuestion}
                  handleChatSubmit={handleChatSubmit}
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
                  <Tabs defaultValue="chat" className="w-full h-full flex flex-col">
                    <TabsList className="mb-2 w-full flex-shrink-0">
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

                    {/* Chat Panel */}
                    <TabsContent value="chat" className="flex-1 w-full overflow-hidden">
                      <ChatPanel
                        question={question}
                        setQuestion={setQuestion}
                        chatResponse={chatResponse}
                        isChatLoading={isChatLoading}
                        chatHistory={chatHistory}
                        handleChatSubmit={handleChatSubmit}
                      />
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