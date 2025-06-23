export type ColumnKey = 'name' | 'namespace' | 'status' | 'ready' | 'restarts' | 'cpu' | 'memory' | 'node' | 'ip' | 'age';

export interface ColumnVisibility {
  name: boolean;
  namespace: boolean;
  status: boolean;
  ready: boolean;
  restarts: boolean;
  cpu: boolean;
  memory: boolean;
  node: boolean;
  ip: boolean;
  age: boolean;
}