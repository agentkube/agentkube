import { TaskCalls, ThinkingStep, ProvisioningState, ProvisioningStep, CodeProps } from "@/types/provision/chat";
import { motion, AnimatePresence } from 'framer-motion';
import { Braces, ChevronDown, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { ThinkingTimeline } from "../tools/thinking.provisiondrawer";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { TemplateParameter } from "../tools/templateparams.provisiondrawer";
import { Checkbox } from "@/components/ui/checkbox";
import { ProvisioningProgress } from "../tools/provisioningprogress.provisiondrawer";
import { Button } from "@/components/ui/button";
import { AgentkubeBot } from "@/assets/icons";

const defaultParameters: TaskCalls = {
  clusterName: 'my-eks-cluster',
  nodeCount: 3,
  instanceType: 't3.medium',
  region: 'us-west-2',
  version: '1.28',
  networking: {
    vpcCidr: '10.0.0.0/16',
    enablePrivateEndpoint: false,
  },
  addons: {
    enableClusterAutoscaler: true,
    enableALBController: false,
    enableEFS: false,
  },
};

export const AssistantMessage: React.FC<{
  content: string;
  parameters?: TaskCalls;
  onParameterChange?: (parameters: TaskCalls) => void;
  isStreaming?: boolean;
  thinkingSteps?: ThinkingStep[];
  currentThinkingStep?: number;
  completedThinkingSteps?: ThinkingStep[];
}> = ({ content, parameters, onParameterChange, isStreaming = false, thinkingSteps, currentThinkingStep, completedThinkingSteps }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localParams, setLocalParams] = useState(parameters || defaultParameters);
  const [provisioningState, setProvisioningState] = useState<ProvisioningState>({
    isProvisioning: false,
    isPaused: false,
    isCompleted: false,
    currentStep: 0,
    steps: [],
    logs: []
  });

  // Ref to store the timeout for pausing
  const provisioningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentStepRef = useRef<number>(0);

  const handleParameterUpdate = (updates: Partial<TaskCalls>) => {
    const updatedParams = { ...localParams, ...updates };
    setLocalParams(updatedParams);
    if (onParameterChange) {
      onParameterChange(updatedParams);
    }
  };

  const handleNestedUpdate = (section: 'networking' | 'addons', updates: any) => {
    const updatedParams = {
      ...localParams,
      [section]: { ...localParams[section], ...updates }
    };
    setLocalParams(updatedParams);
    if (onParameterChange) {
      onParameterChange(updatedParams);
    }
  };

  const simulateProvisioningStep = async (stepIndex: number, steps: ProvisioningStep[]): Promise<boolean> => {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // Update current step to in-progress
      setProvisioningState(prev => ({
        ...prev,
        currentStep: stepIndex + 1,
        steps: prev.steps.map((step, index) =>
          index === stepIndex
            ? { ...step, status: 'in-progress' as const }
            : step
        ),
        logs: [...prev.logs, `Starting: ${steps[stepIndex].title}`]
      }));

      // Simulate step duration (2-4 seconds)
      const duration = 2000 + Math.random() * 2000;
      
      provisioningTimeoutRef.current = setTimeout(() => {
        const endTime = Date.now();
        const stepDuration = Math.round((endTime - startTime) / 1000);

        // Check if we're still running (not paused/terminated)
        setProvisioningState(prev => {
          if (prev.isPaused) {
            return prev; // Don't update if paused
          }
          
          return {
            ...prev,
            steps: prev.steps.map((step, index) =>
              index === stepIndex
                ? { ...step, status: 'completed' as const, duration: stepDuration }
                : step
            ),
            logs: [...prev.logs, `✓ Completed: ${steps[stepIndex].title} (${stepDuration}s)`]
          };
        });

        resolve(true);
      }, duration);
    });
  };

  const simulateProvisioning = async () => {
    const steps: ProvisioningStep[] = [
      {
        id: 1,
        title: "Validating Configuration",
        description: "Checking parameters and validating cluster configuration",
        status: 'pending'
      },
      {
        id: 2,
        title: "Creating VPC",
        description: "Setting up Virtual Private Cloud and networking components",
        status: 'pending'
      },
      {
        id: 3,
        title: "Provisioning EKS Cluster",
        description: "Creating the managed Kubernetes control plane",
        status: 'pending'
      },
      {
        id: 4,
        title: "Setting up Node Groups",
        description: "Launching and configuring worker nodes",
        status: 'pending'
      },
      {
        id: 5,
        title: "Installing Add-ons",
        description: "Deploying cluster autoscaler and other required add-ons",
        status: 'pending'
      },
      {
        id: 6,
        title: "Final Configuration",
        description: "Applying final configurations and health checks",
        status: 'pending'
      }
    ];

    setProvisioningState({
      isProvisioning: true,
      isPaused: false,
      isCompleted: false,
      currentStep: 0,
      steps,
      logs: ['Starting infrastructure provisioning...']
    });

    currentStepRef.current = 0;

    for (let i = 0; i < steps.length; i++) {
      currentStepRef.current = i;
      
      // Check if paused before starting each step
      const isPaused = await new Promise<boolean>((resolve) => {
        const checkPaused = () => {
          setProvisioningState(prev => {
            if (prev.isPaused) {
              resolve(true);
              return prev;
            }
            resolve(false);
            return prev;
          });
        };
        checkPaused();
      });

      if (isPaused) {
        break;
      }

      await simulateProvisioningStep(i, steps);

      // Check again if paused after step completion
      const isStillPaused = await new Promise<boolean>((resolve) => {
        setProvisioningState(prev => {
          resolve(prev.isPaused);
          return prev;
        });
      });

      if (isStillPaused) {
        break;
      }
    }

    // Add final completion log only if not paused
    setProvisioningState(prev => {
      if (!prev.isPaused) {
        return {
          ...prev,
          isCompleted: true,
          logs: [...prev.logs, '🎉 Infrastructure provisioning completed successfully!']
        };
      }
      return prev;
    });
  };

  const handleProvisionCluster = () => {
    simulateProvisioning();
  };

  const handlePauseProvisioning = () => {
    // Clear any pending timeout
    if (provisioningTimeoutRef.current) {
      clearTimeout(provisioningTimeoutRef.current);
      provisioningTimeoutRef.current = null;
    }

    setProvisioningState(prev => {
      const currentStepIndex = currentStepRef.current;
      const updatedSteps = prev.steps.map((step, index) => {
        if (index === currentStepIndex && step.status === 'in-progress') {
          return { ...step, status: 'terminated' as const, duration: 0 };
        }
        return step;
      });

      return {
        ...prev,
        isPaused: true,
        steps: updatedSteps,
        logs: [...prev.logs, `❌ Provisioning terminated at step: ${prev.steps[currentStepIndex]?.title}`]
      };
    });
  };

  const handleResumeProvisioning = () => {
    // Reset all steps and restart from beginning
    setProvisioningState(prev => ({
      ...prev,
      isPaused: false,
      isCompleted: false,
      currentStep: 0,
      steps: prev.steps.map(step => ({ ...step, status: 'pending' as const, duration: undefined })),
      logs: [...prev.logs, '🔄 Restarting provisioning from the beginning...']
    }));

    // Restart the provisioning process
    setTimeout(() => {
      simulateProvisioning();
    }, 500);
  };

  const handleReRunProvisioning = () => {
    // Reset all steps and restart from beginning
    setProvisioningState(prev => ({
      ...prev,
      isPaused: false,
      isCompleted: false,
      currentStep: 0,
      steps: prev.steps.map(step => ({ ...step, status: 'pending' as const, duration: undefined })),
      logs: [...prev.logs, '🔄 Re-running provisioning...']
    }));

    // Restart the provisioning process
    setTimeout(() => {
      simulateProvisioning();
    }, 500);
  };

  const handleCloseProvisioning = () => {
    // Clear any pending timeout
    if (provisioningTimeoutRef.current) {
      clearTimeout(provisioningTimeoutRef.current);
      provisioningTimeoutRef.current = null;
    }

    setProvisioningState({
      isProvisioning: false,
      isPaused: false,
      isCompleted: false,
      currentStep: 0,
      steps: [],
      logs: []
    });
  };

  return (
    <div className="w-full relative">
      <div className="bg-gray-300/30 dark:bg-gray-800/20 p-3 text-gray-800 dark:text-gray-300 w-full px-4">
        <div className="flex items-start">
          <div className="dark:bg-gray-700/30 w-7 h-7 rounded-md overflow-hidden flex items-center justify-center mr-2 text-green-400 mt-1">
            {/* <Sparkles className="h-4 w-4" /> */}
            <AgentkubeBot className="h-5 w-5" />
          </div>
          <div className="flex-1 overflow-auto py-1">
            {/* Completed Thinking Timeline - shown as collapsible accordion after response is complete */}
            {completedThinkingSteps && completedThinkingSteps.length > 0 && (
              <ThinkingTimeline
                steps={completedThinkingSteps}
                currentStep={completedThinkingSteps.length}
                isCompleted={true}
                isCollapsible={true}
              />
            )}

            {/* Active Thinking Timeline - only show when streaming and we have thinking steps */}
            {isStreaming && thinkingSteps && thinkingSteps.length > 0 && (
              <ThinkingTimeline steps={thinkingSteps} currentStep={currentThinkingStep || 1} />
            )}

            {/* Streaming indicator */}
            {isStreaming && !thinkingSteps && (
              <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
                <div className="animate-pulse flex space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span>Generating response...</span>
              </div>
            )}

            {/* Display the regular message content */}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold mt-6 mb-4">{children}</h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold mt-5 mb-3">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-bold mt-4 mb-2">{children}</h3>
                ),
                p: ({ children }) => (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc list-outside space-y-2 mb-4 ml-4">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-outside space-y-2 mb-4 ml-4 pl-6">{children}</ol>
                ),
                li: ({ children }) => (
                  <li className="text-gray-700 dark:text-gray-300">{children}</li>
                ),
                code: ({ inline, children, className }: CodeProps) => {
                  if (inline) {
                    return <code className="bg-gray-200 dark:bg-gray-800 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
                  }
                  return <code className="bg-gray-200 dark:bg-gray-800/80 text-green-400 px-1 py-0.5 rounded text-sm font-mono">{children}</code>;
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-gray-400 dark:border-gray-600 pl-4 py-2 my-4 text-gray-700 dark:text-gray-300 italic">
                    {children}
                  </blockquote>
                ),
              }}
            >
              {content}
            </ReactMarkdown>

            {/* Parameters Section */}
            {parameters && (
              <>
                <TemplateParameter jsonObjects={[JSON.stringify(parameters, null, 2)]} />

                {/* Parameters Toggle */}
                <div className={`border border-gray-300 dark:border-gray-800/50 rounded-md dark:bg-gray-500/10  ${isExpanded ? "bg-gray-100 dark:bg-gray-500/5" : ""}`}>
                  <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full justify-between h-auto flex py-1.5 px-2 cursor-pointer "
                  >
                    <div className='flex items-center space-x-1 dark:text-gray-400'>
                      <Braces className='h-3 w-3' />
                      <span className="text-xs font-medium">Configure Parameters</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-600 dark:text-gray-500  transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Parameters Panel */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="py-2 px-4 space-y-4">
                          {/* Basic Configuration */}
                          <div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600 dark:text-gray-400">Cluster Name</Label>
                                <Input
                                  type="text"
                                  value={localParams.clusterName}
                                  onChange={(e) => handleParameterUpdate({ clusterName: e.target.value })}
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600 dark:text-gray-400">Region</Label>
                                <Select
                                  value={localParams.region}
                                  onValueChange={(value) => handleParameterUpdate({ region: value })}
                                >
                                  <SelectTrigger className="text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="us-west-2">us-west-2</SelectItem>
                                    <SelectItem value="us-east-1">us-east-1</SelectItem>
                                    <SelectItem value="eu-west-1">eu-west-1</SelectItem>
                                    <SelectItem value="ap-southeast-1">ap-southeast-1</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600 dark:text-gray-400">Node Count</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  max="10"
                                  value={localParams.nodeCount}
                                  onChange={(e) => handleParameterUpdate({ nodeCount: parseInt(e.target.value) })}
                                  className="text-sm"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600 dark:text-gray-400">Instance Type</Label>
                                <Select
                                  value={localParams.instanceType}
                                  onValueChange={(value) => handleParameterUpdate({ instanceType: value })}
                                >
                                  <SelectTrigger className="text-sm">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="t3.micro">t3.micro</SelectItem>
                                    <SelectItem value="t3.small">t3.small</SelectItem>
                                    <SelectItem value="t3.medium">t3.medium</SelectItem>
                                    <SelectItem value="t3.large">t3.large</SelectItem>
                                    <SelectItem value="m5.large">m5.large</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>

                          {/* Networking */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Networking</h4>
                            <div className="space-y-2">
                              <div className="space-y-2">
                                <Label className="text-xs text-gray-600 dark:text-gray-400">VPC CIDR</Label>
                                <Input
                                  type="text"
                                  value={localParams.networking.vpcCidr}
                                  onChange={(e) => handleNestedUpdate('networking', { vpcCidr: e.target.value })}
                                  className="text-sm"
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="private-endpoint"
                                  checked={localParams.networking.enablePrivateEndpoint}
                                  onCheckedChange={(checked) => handleNestedUpdate('networking', { enablePrivateEndpoint: checked })}
                                />
                                <Label htmlFor="private-endpoint" className="text-xs text-gray-600 dark:text-gray-400">
                                  Enable Private Endpoint
                                </Label>
                              </div>
                            </div>
                          </div>

                          {/* Add-ons */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Add-ons</h4>
                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="autoscaler"
                                  checked={localParams.addons.enableClusterAutoscaler}
                                  onCheckedChange={(checked) => handleNestedUpdate('addons', { enableClusterAutoscaler: checked })}
                                />
                                <Label htmlFor="autoscaler" className="text-xs text-gray-600 dark:text-gray-400">
                                  Cluster Autoscaler
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="alb"
                                  checked={localParams.addons.enableALBController}
                                  onCheckedChange={(checked) => handleNestedUpdate('addons', { enableALBController: checked })}
                                />
                                <Label htmlFor="alb" className="text-xs text-gray-600 dark:text-gray-400">
                                  AWS Load Balancer Controller
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="efs"
                                  checked={localParams.addons.enableEFS}
                                  onCheckedChange={(checked) => handleNestedUpdate('addons', { enableEFS: checked })}
                                />
                                <Label htmlFor="efs" className="text-xs text-gray-600 dark:text-gray-400">
                                  EFS CSI Driver
                                </Label>
                              </div>
                            </div>
                          </div>

                          <ProvisioningProgress
                            provisioningState={provisioningState}
                            onClose={handleCloseProvisioning}
                            onPause={handlePauseProvisioning}
                            onResume={handleResumeProvisioning}
                            onReRun={handleReRunProvisioning}
                          />

                          {/* Action Buttons - update the Provision Cluster button */}
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="default"
                              className="flex-1 dark:bg-white dark:text-gray-700 dark:hover:text-gray-400"
                              onClick={handleProvisionCluster}
                              disabled={provisioningState.isProvisioning && !provisioningState.isPaused}
                            >
                              {provisioningState.isProvisioning && !provisioningState.isPaused ? 'Provisioning...' : 
                               provisioningState.isCompleted ? 'Provision New Cluster' : 'Provision Cluster'}
                            </Button>
                            <Button variant="default" className="flex-1">
                              Save as Template
                            </Button>
                          </div>

                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};