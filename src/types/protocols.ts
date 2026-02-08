export interface Command {
  format: string;
  docString: string;
  example: string;
  readOnly: boolean;
  order: number;
}

export type ReferenceType = string | 'FINAL' | 'STOP';

export interface NextStep {
  referenceType: ReferenceType;
  targetStepNumber?: number;
  conditions: string[];
  isUnconditional: boolean;
  order: number;
}

export interface ProtocolStep {
  number: number;
  title: string;
  details: string;
  commands: Command[];
  nextSteps: NextStep[];
}


/**
 * Request payload for creating a response protocol
 */
export interface CreateResponseProtocolRequest {
  userId: string;
  orgId: string;
  name: string;
  description: string;
  steps: ProtocolStep[];
}

/**
 * Response from creating a response protocol
 */
export interface ResponseProtocolCreatedResponse {
  id: string;
  userId: string;
  orgId: string;
  name: string;
  description: string;
  steps: ProtocolStep[];
  createdAt?: string;
  updatedAt?: string;
}