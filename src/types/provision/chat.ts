export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  parameters?: TaskCalls;
  timestamp: Date;
  completedThinkingSteps?: ThinkingStep[];
}

export interface TaskCalls {
  clusterName: string;
  nodeCount: number;
  instanceType: string;
  region: string;
  version: string;
  networking: {
    vpcCidr: string;
    enablePrivateEndpoint: boolean;
  };
  addons: {
    enableClusterAutoscaler: boolean;
    enableALBController: boolean;
    enableEFS: boolean;
  };
}

export interface ThinkingStep {
  id: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number | string;[key: string]: any }>;
  completed: boolean;
  inProgress: boolean;
}


export interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export interface ProvisioningStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error' | 'terminated';
  logs?: string[];
  duration?: number;
}

export interface ProvisioningState {
  isProvisioning: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  currentStep: number;
  steps: ProvisioningStep[];
  logs: string[];
}