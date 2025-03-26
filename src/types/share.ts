// types/share.ts

export interface Command {
  error: boolean;
  output: string;
  command: string;
  timestamp: string;
}

export interface InvestigationStep {
  summary: string;
  commands: Command[];
  timestamp: string;
  stepNumber: number;
  description: string;
}

export interface Results {
  steps: InvestigationStep[];
}

export interface Cluster {
  clusterName: string;
  status: string;
}

export interface ProtocolStep {
  id: string;
  number: number;
  title: string;
  details: string;
  protocolId: string;
  createdAt: string;
  updatedAt: string;
  commands: string[];
  nextSteps: string[];
}

export interface Protocol {
  id?: string;
  name: string;
  description: string;
  steps: ProtocolStep[];
}

export interface SharedInvestigation {
  id: string;
  type: 'PROTOCOL_BASED' | 'SMART';
  protocolId: string;
  clusterId: string;
  status: string;
  currentStepNumber: number;
  results: Results;
  name: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  cluster: Cluster;
  protocol: Protocol;
  sharedBy: string;
  sharedAt: string;
  expiresAt: string | null;
  viewCount: number;
}

export interface SharedInvestigationResponse {
  investigation: SharedInvestigation;
}

export interface SharedInvestigationApiResponse {
  investigation: SharedInvestigation;
}