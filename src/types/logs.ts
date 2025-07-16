export interface Pod {
  name: string;
  namespace: string;
  containers: string[];
  expanded?: boolean;
}

export interface LogsSelection {
  podName: string;
  namespace: string;
  containerName: string;
  logs: string;
}
