export interface Organization {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: OrganizationMember[];
}

export interface OrganizationMember {
  id: string;
  userId: string;
  orgId: string;
  role: string;
  joinedAt: string;
  updatedAt: string;
}

export interface Command {
  id: string;
  format: string;
  docString: string;
  example: string;
  readOnly: boolean;
  stepId: string;
  createdAt: string;
  updatedAt: string;
  order: number;
}

export interface NextStep {
  id: string;
  referenceType: "STEP" | "FINAL" | "STOP";
  targetStepNumber: number | null;
  conditions: string[];
  isUnconditional: boolean;
  stepId: string;
  createdAt: string;
  updatedAt: string;
  order: number;
}

export interface Step {
  id: string;
  number: number;
  title: string;
  details: string;
  protocolId: string;
  createdAt: string;
  updatedAt: string;
  commands: Command[];
  nextSteps: NextStep[];
}

export interface Protocol {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  orgId: string;
  userId: string;
  isActive: boolean;
  version: number;
  organization: Organization;
  steps: Step[];
}

export interface CommandResult {
  error: boolean;
  output: string;
  command: string;
  timestamp: string;
}

export interface StepResult {
  commands: CommandResult[];
  timestamp: string;
  stepNumber: number;
  description: string;
  summary: string;
}

export interface Cluster {
  id: string;
  clusterName: string;
  status: string;
  externalEndpoint: string;
}

export interface ProtocolResults {
  steps: StepResult[];
}

export interface Investigation {
  id: string;
  protocolId: string;
  clusterId: string;
  status: string;
  currentStepNumber: number;
  results: ProtocolResults;
  createdAt: string;
  updatedAt: string;
  protocol: Protocol;
  cluster: Cluster;
  jobState: string;
  progress: number;
  currentStep: Step;
}

export interface RunInvestigationResponse {
  message: string;
  investigation: {
    id: string;
    protocolId: string;
    clusterId: string;
    status: string;
    currentStepNumber: number;
    results?: {
      steps: any[];
      status: string;
      startedAt: string;
    };
    createdAt: string;
    updatedAt: string;
  };
  jobId: string;
}

export interface CancelInvestigationResponse {
  message: string;
}

export interface InvestigateFurtherResponse {
  message: string;
  jobId: string;
  nextStep?: {
    command: string;
    description: string;
    shouldRepeat?: boolean;
  };
}


export interface SharedInvestigation {
  id: string;
  shareToken: string;
  investigationId: string;
  userId: string;
  createdAt: string; 
  expiresAt: string | null; 
  isActive: boolean;
  viewCount: number;
  investigation: {
      name: string | null;
      description: string | null;
      type: "PROTOCOL_BASED" | "SMART"; 
      status: "COMPLETED" | string;  
  };
}
