// src/types/investigation.types.ts
import { StepReferenceType } from '@prisma/client';

// Protocol and Step related types
export interface Command {
  id: string;
  format: string;
  docString: string;
  example: string;
  readOnly: boolean;
  stepId: string;
  order: number;
}

export interface NextStep {
  id: string;
  referenceType: StepReferenceType;
  targetStepNumber: number | null;
  conditions: string[];
  isUnconditional: boolean;
  stepId: string;
  order: number;
}

export interface Step {
  id: string;
  number: number;
  title: string;
  details: string;
  commands: Command[];
  nextSteps: NextStep[];
}

// Command execution result types
export interface CommandResult {
  command: string;
  output: string;
  error?: boolean;
  timestamp?: string;
}

export interface StepResult {
  stepNumber: number;
  commands: CommandResult[];
  timestamp: string;
}

// Queue and job related types
export interface InvestigationJobData {
  investigationId: string;
  protocolId: string;
  currentStepNumber: number;
  clusterId: string;
  commandResults: StepResult[];
}

export interface JobCompletionResult {
  status: 'completed' | 'failed';
  results: StepResult[];
}

// Investigation status types
export type InvestigationStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export interface InvestigationError {
  message: string;
  step?: number;
  command?: string;
  timestamp: string;
}

export interface InvestigationResult {
  steps: StepResult[];
  status: InvestigationStatus;
  error?: InvestigationError;
  startedAt: string;
  completedAt?: string;
}