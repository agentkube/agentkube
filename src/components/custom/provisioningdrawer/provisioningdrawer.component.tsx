import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, X, Sparkles, Trash2, Cloud, ArrowUp, Check, Search, Settings, Zap, FileArchive, Paperclip, AlignVerticalJustifyEnd } from "lucide-react";
import { AutoResizeTextarea } from '@/components/custom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChatMessage,
  TaskCalls,
  ThinkingStep,
} from "@/types/provision/chat";
import { Messages } from './assistant/messages.provisiondrawer';
import { Ansible, Github, OpenTofu, Pulumi, Terraform, Terragrunt } from '@/assets/icons';

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

const drawerVariants = {
  hidden: { x: '100%', opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', damping: 25, stiffness: 200 } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.3 } }
};

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.3 } }
};


interface ProvisionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ProvisionDrawer: React.FC<ProvisionDrawerProps> = ({ isOpen, onClose }) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [inputValue, setInputValue] = useState<string>('');
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentResponse, setCurrentResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [drawerMounted, setDrawerMounted] = useState<boolean>(false);
  const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [currentThinkingStep, setCurrentThinkingStep] = useState<number>(0);

  // Use a ref to accumulate streaming response
  const responseRef = useRef('');

  useEffect(() => {
    setDrawerMounted(true);
    return () => {
      setDrawerMounted(false);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleClose = (): void => {
    try {
      setIsClosing(true);
      setTimeout(() => {
        onClose();
        setIsClosing(false);
      }, 300);
    } catch (error) {
      console.error("Error closing drawer:", error);
      onClose();
      setIsClosing(false);
    }
  };

  const handleClearMessages = (): void => {
    setMessages([]);
    setInputValue('');
    setCurrentResponse('');
    setThinkingSteps([]);
    setCurrentThinkingStep(0);
  };

  const generateThinkingSteps = (query: string): ThinkingStep[] => {
    const baseSteps = [
      {
        id: 1,
        title: "Analyzing Request",
        description: "Processing your infrastructure requirements and identifying key components",
        icon: Search,
        completed: false,
        inProgress: false
      },
      {
        id: 2,
        title: "Selecting Best Practices",
        description: "Applying industry standards and cloud provider recommendations",
        icon: Check,
        completed: false,
        inProgress: false
      },
      {
        id: 3,
        title: "Configuring Parameters",
        description: "Setting up optimal defaults for your use case",
        icon: Settings,
        completed: false,
        inProgress: false
      },
      {
        id: 4,
        title: "Generating Template",
        description: "Creating infrastructure-as-code template with your specifications",
        icon: Zap,
        completed: false,
        inProgress: false
      }
    ];

    // Add specific steps based on query content
    if (query.toLowerCase().includes('eks') || query.toLowerCase().includes('kubernetes')) {
      baseSteps.splice(2, 0, {
        id: 3,
        title: "Kubernetes Setup",
        description: "Configuring node groups, networking, and essential add-ons",
        icon: Settings,
        completed: false,
        inProgress: false
      });
      // Update subsequent IDs
      baseSteps.forEach((step, index) => {
        if (index >= 3) step.id = index + 1;
      });
    }

    return baseSteps;
  };

  const generateDummyResponse = (query: string): string => {
    if (query.toLowerCase().includes('eks')) {
      return "I'll help you provision an EKS cluster. Based on your request, I've configured the recommended settings for a production-ready cluster with managed node groups, VPC networking, and essential add-ons. You can customize the parameters below before deployment.";
    }
    if (query.toLowerCase().includes('aks')) {
      return "Setting up an AKS cluster for you. I've prepared the configuration with Azure-specific best practices including system node pools, network policies, and Azure integrations. Review and adjust the parameters as needed.";
    }
    if (query.toLowerCase().includes('gke')) {
      return "Configuring a GKE cluster with Google Cloud best practices. The setup includes autopilot mode options, workload identity, and GCP-native networking. Please review the configuration parameters below.";
    }
    return "I've analyzed your provisioning request and prepared a cluster configuration. Please review the parameters below and adjust them according to your requirements before proceeding with the deployment.";
  };

  // Simulate thinking process with timeline - 5 seconds per step
  const simulateThinkingProcess = async (steps: ThinkingStep[]): Promise<void> => {
    setThinkingSteps(steps);

    for (let i = 0; i < steps.length; i++) {
      // Mark current step as in progress
      setThinkingSteps(prev => prev.map((step, index) => ({
        ...step,
        inProgress: index === i,
        completed: index < i
      })));
      setCurrentThinkingStep(i + 1);

      // Simulate processing time for each step - 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Mark step as completed
      setThinkingSteps(prev => prev.map((step, index) => ({
        ...step,
        inProgress: false,
        completed: index <= i
      })));
    }
  };

  // Simulate streaming response
  const simulateStreaming = async (response: string): Promise<void> => {
    responseRef.current = '';
    setCurrentResponse('');

    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      if (i === 0) {
        responseRef.current = words[i];
      } else {
        responseRef.current += ' ' + words[i];
      }
      setCurrentResponse(responseRef.current);
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    }
  };

  const handleSubmit = async (e: React.FormEvent | React.KeyboardEvent): Promise<void> => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentQuery = inputValue;
    setInputValue('');
    setIsLoading(true);
    setIsInputFocused(false);

    try {
      // Generate thinking steps based on the query
      const steps = generateThinkingSteps(currentQuery);

      // Start thinking process
      const thinkingPromise = simulateThinkingProcess(steps);

      // Wait for thinking to complete
      await thinkingPromise;

      // Store completed thinking steps for the accordion
      const completedSteps = steps.map(step => ({ ...step, completed: true, inProgress: false }));

      // Start response generation
      const response = generateDummyResponse(currentQuery);

      // Simulate streaming
      await simulateStreaming(response);

      // Add the complete message with completed thinking steps
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        parameters: { ...defaultParameters },
        timestamp: new Date(),
        completedThinkingSteps: completedSteps
      };

      setMessages(prev => [...prev, assistantMessage]);
      setCurrentResponse('');
      setThinkingSteps([]);
      setCurrentThinkingStep(0);

    } catch (error) {
      console.error('Failed to process message:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date()
        }
      ]);
      setThinkingSteps([]);
      setCurrentThinkingStep(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string): void => {
    setInputValue(suggestion);
    setIsInputFocused(false);
    // Focus the input after a small delay to ensure it's rendered
    setTimeout(() => {
      const textarea = document.querySelector('textarea[placeholder="Describe your infrastructure needs..."]') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        // Move cursor to end
        textarea.setSelectionRange(suggestion.length, suggestion.length);
      }
    }, 100);
  };

  const handleParameterChange = (messageId: string, parameters: TaskCalls): void => {
    setMessages(prev => prev.map((msg, index) =>
      index.toString() === messageId ? { ...msg, parameters } : msg
    ));
  };

  const handleInputFocus = (): void => {
    if (messages.length === 0) {
      setIsInputFocused(true);
    }
  };

  // Early return only after mounted check to avoid hydration issues
  if (!drawerMounted || !isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop with animation */}
          <motion.div
            className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={backdropVariants}
            onClick={handleClose}
          />

          {/* Drawer with smooth animation */}
          <motion.div
            className="fixed top-0 right-0 h-full w-1/2 bg-gray-100 dark:bg-[#0B0D13] shadow-lg z-40"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={drawerVariants}
          >
            <div className="flex flex-col h-full">
              <div className="p-4 border-b dark:border-gray-700/30 flex items-center justify-between">
                <div className='flex items-center space-x-2'>
                  <AlignVerticalJustifyEnd className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                  <h3 className="font-medium text-md text-gray-800 dark:text-gray-200">Provisioner</h3>
                </div>
                <div className="flex items-center gap-2 text-gray-800 dark:text-gray-500">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearMessages}
                    className="p-1"
                    title="Clear messages"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="p-1"
                  >
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClose}
                    className="p-1"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div
                className={`flex-grow 
                  [&::-webkit-scrollbar]:w-1.5 
                  [&::-webkit-scrollbar-track]:bg-transparent 
                  [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
                  [&::-webkit-scrollbar-thumb]:rounded-full
                  [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
                  overflow-auto transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-full'}`}
              >
                <div className="py-4">
                  <Messages
                    messages={messages}
                    currentResponse={currentResponse}
                    isLoading={isLoading}
                    onParameterChange={handleParameterChange}
                    thinkingSteps={thinkingSteps}
                    currentThinkingStep={currentThinkingStep}
                    onSuggestionClick={handleSuggestionClick}
                  />
                </div>
              </div>

              {isInputFocused && messages.length === 0 && (
                <motion.div
                  className='px-8 py-4 bg-gray-200 dark:bg-[#18181b]'
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="mb-3">
                    <Cloud className="h-4 w-4 text-gray-700 dark:text-gray-300 mb-2" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Tell me what infrastructure you'd like to provision. For example: 'Create an EKS cluster for production workloads' or 'Set up an AKS cluster with monitoring enabled'.
                    </p>
                  </div>
                </motion.div>
              )}

              <div className="border-t dark:border-gray-700/40 px-2 py-4 mt-auto">
                <form onSubmit={handleSubmit} className=" gap-2 items-baseline rounded-lg px-1">
                  <AutoResizeTextarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={handleInputFocus}
                    onSubmit={handleSubmit}
                    animatedSuggestions={[
                      "Set up a local Kind cluster",
                      "Create a k3s cluster for edge computing",
                      "Deploy a local minikube environment",
                      "Create an EKS cluster for production workloads",
                      "Set up an AKS cluster with monitoring enabled",
                      "Deploy a GKE cluster with auto-scaling"
                    ]}
                    disabled={isLoading}
                    className="dark:border-transparent"
                    autoFocus={true}
                  />

                  <div className="flex items-center justify-end">
                    <div className='flex mr-2'>
                    <Button size="icon" variant="ghost">
                        <Ansible size={20} />
                        {/* <img src={Terragrunt} className='h-6' alt="" /> */}
                      </Button>
                      <Button size="icon" variant="ghost">
                        <Paperclip size={16} />
                      </Button>
                      <Button size="icon" variant="ghost">
                        <Github size={16} />
                      </Button>
                    </div>
                    <Button
                      type="submit"
                      disabled={isLoading || !inputValue.trim()}
                      className="p-3 h-1 w-1 rounded-full dark:text-black text-white bg-black dark:bg-white hover:dark:bg-gray-300"
                    >
                      <ArrowUp className='h-2 w-2' />
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ProvisionDrawer;