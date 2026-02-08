export interface Protocol {
  id: string;
  title: string;
  isActive?: boolean;
}


export enum StepReferenceType {
  STEP = 'STEP',
  FINAL = 'FINAL',
  STOP = 'STOP'
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
  id?: string;
  referenceType: StepReferenceType;
  targetStepNumber: number | null;
  conditions: string[];
  isUnconditional: boolean;
  stepId: string;
  createdAt?: string;
  updatedAt?: string;
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

export interface ResponseProtocolCreatedBy{
  id: string;
  name: string;
  email: string;
}

export interface ResponseProtocolStats {
  id: string;
  protocolId: string;
  totalExecutions: number;
  lastExecutionStatus: string;
  lastExecutionTime: string;
  successfulExecutions: number;
  failedExecutions: number;
  pendingExecutions: number;
  averageExecutionTime: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResponseProtocol {
  id: string;
  name: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
  orgId: string;
  userId: string;
  isActive: boolean;
  version: number;
  steps: Step[];
  createdBy?: ResponseProtocolCreatedBy
  stats?: ResponseProtocolStats
}

// Optional: Response interfaces for API endpoints
export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface GetProtocolsResponse {
  protocols: ResponseProtocol[];
  pagination: PaginationInfo;
}

// Optional: Request interfaces for creating/updating
export interface CreateProtocolRequest {
  userId: string;
  orgId: string;
  name: string;
  description: string;
  steps: Omit<Step, 'id' | 'protocolId' | 'createdAt' | 'updatedAt'>[];
}

export interface UpdateProtocolRequest {
  name: string;
  description: string;
  steps: Omit<Step, 'id' | 'protocolId' | 'createdAt' | 'updatedAt'>[];
}