export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPServer {
  name: string;
  slug: string;
  creator: string;
  description: string;
  version: string;
  repository: string;
  category: string;
  tags: string[];
  configuration: MCPServerConfig;
}

export interface MCPMarketplace {
  $schema: string;
  version: string;
  servers: MCPServer[];
}

export interface MCPTool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactElement;
  iconBg: string;
  type?: 'Local' | 'Remote';
  category?: string;
  tags?: string[];
  creator?: string;
  repository?: string;
  configuration?: MCPServerConfig;
}

export const MCP_MARKETPLACE_URL = "https://raw.githubusercontent.com/agentkube/marketplace/refs/heads/main/mcp/marketplace.json";