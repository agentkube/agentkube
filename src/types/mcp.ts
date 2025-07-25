export interface MCPServerConfig {
  url?: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface MCPServer {
  name: string;
  config: MCPServerConfig;
}