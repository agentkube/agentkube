import { CommandResult, StepResult } from "./investigation.types";

export interface InvestigationStatus {
  type: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELED';
  message?: string;
  error?: {
    message: string;
    timestamp: string;
  };
}

// Queue specific interfaces
export interface FurtherInvestigationJobData {
  investigationId: string;
  clusterId: string;
  results: {
    steps: StepResult[];
  };
  repeatCommand?: boolean;
  repeatInterval?: number;
}

export interface FurtherInvestigationResponse {
  command: string;
  description: string;
  shouldRepeat?: boolean;
  repeatInterval?: number;
}

export interface FurtherInvestigationStep {
  command: string;
  description: string;
  result?: CommandResult;
  shouldRepeat?: boolean;
  repeatInterval?: number;
}

export interface FurtherInvestigationResult {
  steps: StepResult[];
  status: InvestigationStatus;
  timestamp: string;
}