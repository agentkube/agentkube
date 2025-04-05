export interface AgentKubeConfig {
  general: {
    autoUpdate: boolean;
    usageAnalytics: boolean;
    excludeNamespaces: string[];
    startOnLogin: boolean;
    language: string;
  };
  agentkubeconfig: {
    path: string;
  };
  kubeconfig: {
    path: string;
    externalPaths: string[];
    contextAutoRefresh: boolean;
    contextRefreshInterval: number;
    contextRegionExtension: boolean;
  };
  shortcuts: {
    toggleSidebar: string;
    quickOpen: string;
    search: string;
    toggleTalkToCluster: string;
    kubeSpotlight: string;
    newTerminal: string;
    refreshView: string;
    goToPods: string;
    goToDeployments: string;
    goToServices: string;
    goToVolumes: string;
  };
  appearance: {
    colorMode: string;
    themeOptions: string[];
    fontSize: number;
    fontFamily: string;
  };
  docs: {
    links: Array<{
      name: string;
      url: string;
    }>;
    showHelpTips: boolean;
  };
  models: {
    currentModel: string;
    settings: {
      streaming: boolean;
      maxTokens: number;
      temperature: number;
      contextSize: number;
    };
  };
  terminal: {
    shell: string;
    fontFamily: string;
    fontSize: number;
    cursorStyle: string;
    cursorBlink: boolean;
    scrollback: number;
  };
  editor: {
    wordWrap: boolean;
    autoIndent: boolean;
    tabSize: number;
    insertSpaces: boolean;
    formatOnSave: boolean;
    minimap: {
      enabled: boolean;
      side: string;
    };
  };
  debugging: {
    verbose: boolean;
    logLevel: string;
    logPath: string;
  };
  advanced: {
    proxySettings: {
      enabled: boolean;
      httpProxy: string;
      httpsProxy: string;
      noProxy: string;
    };
    customCommands: any[];
    experimentalFeatures: boolean;
  };
}

export interface MCPServerConfig {
  url?: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>; 
}

export interface McpConfig {
  mcpServers: {
    [key: string]: MCPServerConfig;
  };
}