// types/protocol-patch.ts

export enum StepReferenceType {
  STEP = 'STEP',
  FINAL = 'FINAL',
  STOP = 'STOP'
}

export interface PatchCommandRequest {
  format: string;
  docString: string;
  example: string;
  readOnly: boolean;
  order: number;
}

export interface PatchNextStepRequest {
  referenceType: StepReferenceType;
  targetStepNumber: number | null;
  conditions: string[];
  isUnconditional: boolean;
  order: number;
}

export interface PatchStepRequest {
  number: number;
  title: string;
  details: string;
  commands: PatchCommandRequest[];
  nextSteps: PatchNextStepRequest[];
}

export interface PatchProtocolRequest {
  name: string;
  description: string;
  steps: PatchStepRequest[];
}

// Response Types - These represent the data structure received from the API
export interface PatchCommandResponse {
  id: string;
  format: string;
  docString: string;
  example: string;
  readOnly: boolean;
  order: number;
  stepId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatchNextStepResponse {
  id: string;
  referenceType: StepReferenceType;
  targetStepNumber: number | null;
  conditions: string[];
  isUnconditional: boolean;
  order: number;
  stepId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PatchStepResponse {
  id: string;
  number: number;
  title: string;
  details: string;
  protocolId: string;
  createdAt: string;
  updatedAt: string;
  commands: PatchCommandResponse[];
  nextSteps: PatchNextStepResponse[];
}

export interface PatchProtocolResponse {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  steps: PatchStepResponse[];
}

// API Function Type
export interface PatchProtocolFn {
  (protocolId: string, data: PatchProtocolRequest): Promise<PatchProtocolResponse>;
}

// Error Types
export interface PatchProtocolError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Validation Types
export interface ValidationError {
  field: string;
  message: string;
}

// Utility Types
export type StepOrderMap = Record<string, number>;
export type CommandOrderMap = Record<string, number>;
export type NextStepOrderMap = Record<string, number>;

// Helper Types
export interface StepWithOrdering extends PatchStepRequest {
  originalIndex?: number;
}

export interface CommandWithOrdering extends PatchCommandRequest {
  originalIndex?: number;
}

export interface NextStepWithOrdering extends PatchNextStepRequest {
  originalIndex?: number;
}

// State Management Types
export interface ProtocolPatchState {
  originalProtocol: PatchProtocolResponse | null;
  currentProtocol: PatchProtocolResponse | null;
  isModified: boolean;
  errors: ValidationError[];
  isLoading: boolean;
}

// Action Types
export type ProtocolPatchAction = 
  | { type: 'SET_ORIGINAL_PROTOCOL'; payload: PatchProtocolResponse }
  | { type: 'UPDATE_STEP'; payload: { stepIndex: number; step: PatchStepRequest } }
  | { type: 'ADD_STEP'; payload: PatchStepRequest }
  | { type: 'REMOVE_STEP'; payload: number }
  | { type: 'UPDATE_PROTOCOL_FIELD'; payload: { field: keyof PatchProtocolRequest; value: string } }
  | { type: 'RESET_TO_ORIGINAL' }
  | { type: 'SET_ERRORS'; payload: ValidationError[] }
  | { type: 'SET_LOADING'; payload: boolean };