// OpenCost API Response interfaces
export interface OpenCostWindow {
  start: string;
  end: string;
}

export interface OpenCostAllocation {
  name: string;
  properties?: {
    cluster?: string;
    node?: string;
    providerID?: string;
    labels?: {
      [key: string]: string;
    };
    instanceType?: string;
  };
  window?: {
    start: string;
    end: string;
  };
  start?: string;
  end?: string;
  minutes?: number;
  cpuCores?: number;
  cpuCoreRequestAverage?: number;
  cpuCoreUsageAverage?: number;
  cpuCoreHours?: number;
  cpuCost: number;
  cpuCostAdjustment?: number;
  cpuCostIdle?: number;
  cpuEfficiency?: number;
  gpuCount?: number;
  gpuHours?: number;
  gpuCost: number;
  gpuCostAdjustment?: number;
  gpuCostIdle?: number;
  gpuEfficiency?: number;
  networkTransferBytes?: number;
  networkReceiveBytes?: number;
  networkCost: number;
  networkCrossZoneCost: number;
  networkCrossRegionCost: number;
  networkInternetCost: number;
  networkCostAdjustment?: number;
  pvBytes?: number;
  pvByteHours?: number;
  pvCost: number;
  pvCostAdjustment?: number;
  ramBytes?: number;
  ramByteRequestAverage?: number;
  ramByteUsageAverage?: number;
  ramByteHours?: number;
  ramCost: number;
  ramCostAdjustment?: number;
  ramCostIdle?: number;
  ramEfficiency?: number;
  externalCost?: number;
  sharedCost?: number;
  totalCost: number;
  totalEfficiency: number;
}

export interface OpenCostAllocationResponse {
  code: number;
  status: string;
  data: Record<string, OpenCostAllocation>[];
}

export interface AggregatedNodeCost {
  name: string;
  instanceType: string;
  totalCost: number;
  cpuCost: number;
  ramCost: number;
  pvCost: number;
  networkCost: number;
  gpuCost: number;
  externalCost: number;
  sharedCost: number;
  cpuEfficiency: number;
  ramEfficiency: number;
  totalEfficiency: number;
  cpuReqCoreHrs: number;
  cpuUseCoreHrs: number;
  ramReqByteHrs: number;
  ramUseByteHrs: number;
}

// Component-specific interfaces
export interface ResourceCost {
  cpu: number;
  memory: number;
  storage: number;
  network?: number;
  gpu?: number;
  total: number;
}

export interface NodeCost {
  name: string;
  cost: number;
  percentage: number;
  efficiency: number;
  resources: ResourceCost;
  instanceType?: string;
  instanceCost?: number;
  cluster?: string;
  // Adding additional fields that might be useful
  cpuUsage?: number;
  cpuRequest?: number;
  memoryUsage?: number;
  memoryRequest?: number;
}

export interface ClusterCostSummary {
  clusterName: string;
  totalCost: number;
  idleCost: number;
  activeCost: number;
  window: string;
  resources: ResourceCost;
  efficiency: number;
  daily: DailyCost[];
}

export interface DailyCost {
  date: string;
  cost: number; 
  idleCost: number;
  activeCost: number;
  totalCost?: number; 
}

export interface ServiceCost {
  name: string;
  namespace: string;
  cost: number;
  percentage: number;
  efficiency: number;
  resources: ResourceCost;
  controller?: string;
  controllerKind?: string;
}