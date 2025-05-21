import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CustomMonacoEditor, ChatPanel, SecurityReport, EditorDiff } from '@/components/custom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sun, Moon, Save, ArrowLeft, GripVertical, Wand2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { jsonToYaml, yamlToJson } from '@/utils/yaml';
import { updateResource } from '@/api/internal/resources';
import { ChatMessage } from '@/types/chat';
// import { chatStream } from '@/api/orchestrator.chat';
import { motion, AnimatePresence } from 'framer-motion';
import { scanConfig } from '@/api/scanner/security'; // Add this import
import { MisconfigurationReport } from '@/types/scanner/misconfiguration-report';

interface AIEditorProps {
  // The resource data
  resourceData: any;
  // The namespace of the resource
  namespace: string;
  // The current cluster context
  currentContext: any;
  // Resource name
  resourceName: string;
  // API group (e.g., 'apps' for deployments, empty string for core resources)
  apiGroup?: string;
  // API version (defaults to 'v1')
  apiVersion?: string;
  // Resource type (e.g., 'pods', 'deployments', 'statefulsets')
  resourceType: string;
  // Resource kind display name (e.g., 'Pod', 'Deployment')
  kind: string;
  // Optional onBack handler
  onBack?: () => void;
}



const AIEditor: React.FC<AIEditorProps> = ({
  resourceData,
  namespace,
  currentContext,
  resourceName,
  apiGroup = '',
  apiVersion = 'v1',
  resourceType,
  kind,
  onBack
}) => {
  // State for editor
  const [yamlContent, setYamlContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [securityReport, setSecurityReport] = useState<MisconfigurationReport | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

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


  const handleSecurityScan = async () => {
    if (!yamlContent) {
      toast({
        title: "Error",
        description: "No YAML content to scan",
        variant: "destructive",
      });
      return;
    }

    setIsScanning(true);
    try {
      const result = await scanConfig(yamlContent);
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

  // Initialize YAML content
  useEffect(() => {
    if (resourceData) {
      const yaml = jsonToYaml(resourceData);
      setYamlContent(yaml);
      setOriginalContent(yaml);
    }
  }, [resourceData]);

  // Toggle editor theme
  const toggleTheme = () => {
    setEditorTheme(current => current === 'vs-dark' ? 'light' : 'vs-dark');
  };

  // Handle editor content change
  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setYamlContent(value);
      setHasChanges(value !== originalContent);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!currentContext?.name || !resourceName || !hasChanges) return;

    setIsSaving(true);
    try {
      // Convert YAML to JSON
      const jsonContent = yamlToJson(yamlContent);

      // Update the resource
      await updateResource(
        currentContext.name,
        resourceType as any,
        resourceName,
        jsonContent,
        {
          namespace,
          apiGroup,
          apiVersion
        }
      );

      toast({
        title: "Success",
        description: `${kind} updated successfully`,
        variant: "success"
      });

      // Update the original content to match current content
      setOriginalContent(yamlContent);
      setHasChanges(false);
    } catch (error) {
      console.error(`Error saving ${resourceType}:`, error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : `Failed to save ${kind}`,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle assist sidebar
  const toggleAssist = useCallback(() => {
    const newShowSidebar = !showSidebar;
    setShowSidebar(newShowSidebar);

    // Adjust editor width when sidebar is toggled
    if (newShowSidebar) {
      setEditorWidth('60%');
    } else {
      setEditorWidth('100%');
    }
  }, [showSidebar]);

  // Handle chat submission
  const handleChatSubmit = async (e: React.FormEvent | React.KeyboardEvent) => {
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
      const dummyResponse = getDummyResponse(question, yamlContent);

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

    // Uncomment this section when implementing actual chatStream
    /*
    try {
      await chatStream(
        {
          message: question,
          query_context: yamlContent
        },
        {
          onToken: (token) => {
            chatResponseRef.current += token;
            setChatResponse(chatResponseRef.current);
          },
          onError: (error) => {
            console.error('Chat error:', error);
            setChatResponse('Error: Failed to get response');
          },
          onComplete: () => {
            // Add assistant message to chat history
            const assistantMessage: ChatMessage = {
              role: 'assistant',
              content: chatResponseRef.current
            };
            setChatHistory(prev => [...prev, assistantMessage]);
            setIsChatLoading(false);
            setQuestion('');
            setChatResponse('');
          }
        }
      );
    } catch (error) {
      console.error('Chat error:', error);
      setChatResponse('Error: Failed to start chat');
      setIsChatLoading(false);
    }
    */
  };
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

    if (lowercaseQuery.includes('security') || lowercaseQuery.includes('context')) {
      return "To improve security, I recommend adding a security context to your container:\n\n```yaml\nsecurityContext:\n  runAsNonRoot: true\n  runAsUser: 1000\n  readOnlyRootFilesystem: true\n  allowPrivilegeEscalation: false\n  capabilities:\n    drop: [\"ALL\"]\n```\n\nThis runs your container as a non-root user and applies the principle of least privilege.";
    }

    // Default response
    return "I've examined your YAML configuration. It looks generally well-structured. Some areas you might want to consider reviewing:\n\n1. Resource limits and requests\n2. Health probes\n3. Security contexts\n4. Update strategy\n\nIs there a specific aspect you'd like me to help you improve?";
  };

  // Improved resizer logic with better hover handling
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

    // Limit the minimum and maximum widths
    if (newWidth >= 30 && newWidth <= 85) {
      setEditorWidth(`${newWidth}%`);
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = '';
  };

  // Keyboard shortcut for toggling assist panel (Cmd+B)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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

  return (
    <div className="
          h-full w-full relative overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
          flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b">
        <div className="mx-auto w-full py-2 flex justify-between items-center">
          {/* Back button or title */}
          <div>
            {onBack && (
              <Button variant="ghost" onClick={onBack} className="mr-2">
                <ArrowLeft className="h-4 w-4 mr-2" /> Back
              </Button>
            )}
            {hasChanges && <span className="text-sm text-amber-500">Unsaved changes</span>}
          </div>

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
              disabled={isSaving || !hasChanges}
              className={hasChanges ? "bg-blue-700 hover:bg-blue-700 text-white" : "text-black dark:text-gray-300 bg-gray-50 hover:bg-gray-200 dark:hover:bg-gray-800"}
            >
              {isSaving ? 'Saving...' : <><Save className="h-4 w-4 mr-2" /> Save</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex relative overflow-hidden">
        <div ref={containerRef} className="flex w-full h-full">
          {/* Editor Container */}
          <motion.div
            style={{ width: editorWidth }}
            animate={{ width: editorWidth }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="flex flex-col h-full"
          >
            <div className="flex-1 overflow-auto">
              <div className={`h-full ${editorTheme === 'vs-dark' ? 'bg-[#1e1e1e]' : 'bg-white'} border rounded-lg overflow-hidden`}>
                <div className={`${editorTheme === 'vs-dark' ? 'text-gray-200 border-gray-700' : 'text-gray-700 border-gray-200'} border-b px-4 py-2 flex justify-between items-center`}>
                  <span>{resourceName} {hasChanges && '*'}</span>
                  <button
                    onClick={toggleTheme}
                    className={`p-2 rounded-lg transition-colors ${editorTheme === 'vs-dark'
                      ? 'hover:bg-gray-700 text-gray-300'
                      : 'hover:bg-gray-100 text-gray-600'
                      }`}
                  >
                    {editorTheme === 'vs-dark' ? (
                      <Sun className="h-4 w-4" />
                    ) : (
                      <Moon className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <CustomMonacoEditor
                  value={yamlContent}
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
                className="border-l border-gray-200 dark:border-gray-900 h-full flex-grow overflow-hidden"
              >
                <div className="p-4 h-full w-full">
                  <Tabs defaultValue="chat" className="w-full h-full">
                    <TabsList className="mb-4 w-full">
                      <TabsTrigger value="chat" className="flex-1">Chat</TabsTrigger>
                      <TabsTrigger value="security" className="flex-1">Security</TabsTrigger>
                      <TabsTrigger value="diff" className="flex-1">Diff</TabsTrigger>
                      <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
                    </TabsList>

                    {/* Chat Panel */}
                    <TabsContent value="chat" className="h-[78vh] w-full">
                      <ChatPanel
                        question={question}
                        setQuestion={setQuestion}
                        chatResponse={chatResponse}
                        isChatLoading={isChatLoading}
                        chatHistory={chatHistory}
                        handleChatSubmit={handleChatSubmit}
                      />
                    </TabsContent>

                    {/* Placeholder for other tabs */}
                    <TabsContent value="security" className="h-[78vh] w-full">
                      <SecurityReport
                        yamlContent={yamlContent}
                        report={securityReport}
                        isScanning={isScanning}
                        onScan={handleSecurityScan}
                      />
                    </TabsContent>

                    <TabsContent value="diff" className="h-[calc(100%-56px)] w-full">
                      {/* <div className="bg-gray-100 dark:bg-gray-900/30 border border-gray-300 dark:border-gray-700 rounded-lg p-6 h-full w-full flex items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">Diff feature coming soon</p>
                      </div> */}
                      <EditorDiff
                        originalContent={originalContent}
                        currentContent={yamlContent}
                      />
                    </TabsContent>

                    <TabsContent value="history" className="h-[calc(100%-56px)] w-full">
                      <div className="bg-gray-100 dark:bg-gray-900/30 border border-gray-300 dark:border-gray-700 rounded-lg p-6 h-full w-full flex items-center justify-center">
                        <p className="text-gray-500 dark:text-gray-400">History feature coming soon</p>
                      </div>
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

export default AIEditor;