import { ORCHESTRATOR_URL } from '@/config';
import { AgentKubeConfig, McpConfig } from '@/types/settings';

/**
 * Fetches the current application settings
 * @returns Promise with the application settings
 */
export const getSettings = async (): Promise<AgentKubeConfig> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/config`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as AgentKubeConfig;
  } catch (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }
};

/**
 * Patches specific sections of the configuration directly
 * @param configPatch Partial configuration to patch
 * @returns Promise with the updated settings
 */
export const patchConfig = async (configPatch: {
  [K in keyof AgentKubeConfig]?: Partial<AgentKubeConfig[K]>
}): Promise<AgentKubeConfig> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/config`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ config: configPatch }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to patch config: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as AgentKubeConfig;
  } catch (error) {
    console.error('Error patching config:', error);
    throw error;
  }
};

/**
 * Updates a specific section of the settings
 * @param section Section key (e.g., 'general', 'appearance')
 * @param values Updated values for the section
 * @returns Promise with the updated settings
 */
export const updateSettingsSection = async <K extends keyof AgentKubeConfig>(
  section: K,
  values: Partial<AgentKubeConfig[K]>
): Promise<AgentKubeConfig> => {
  try {
    return await patchConfig({
      [section]: values
    });
  } catch (error) {
    console.error(`Error updating ${section} settings:`, error);
    throw error;
  }
};


/**
 * Updates application settings
 * @param settings Updated settings object
 * @returns Promise with the updated settings
 */
export const updateSettings = async (settings: Partial<AgentKubeConfig>): Promise<AgentKubeConfig> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: settings
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as AgentKubeConfig;
  } catch (error) {
    console.error('Error updating settings:', error);
    throw error;
  }
};

/**
 * Fetches the MCP (Management Control Plane) configuration
 * @returns Promise with the MCP configuration
 */
export const getMcpConfig = async (): Promise<McpConfig> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/mcp`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch MCP config: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching MCP config:', error);
    throw error;
  }
};

/**
 * Updates the MCP configuration
 * @param mcp Updated MCP configuration
 * @returns Promise with the updated MCP configuration
 */
export const updateMcpConfig = async (mcp: McpConfig): Promise<any> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/mcp`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mcp }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update MCP config: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating MCP config:', error);
    throw error;
  }
};

/**
 * Updates the MCP configuration
 * @param serverName Name of the MCP server to delete
 * @returns Promise with the updated MCP configuration
 */
export const deleteMcpConfig = async (serverName: string): Promise<any> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/mcp/${serverName}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to delete MCP config: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error deleting MCP config:', error);
    throw error;
  }
};
/**
 * Imports settings from a file
 * @param filepath Path to the settings file
 * @returns Promise with the import result
 */
export const importSettings = async (filepath: string): Promise<AgentKubeConfig> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/config/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: filepath }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to import settings: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as AgentKubeConfig;
  } catch (error) {
    console.error('Error importing settings:', error);
    throw error;
  }
};

/**
 * Fetches the MCP server information including connection status
 * @returns Promise with the MCP servers information
 */
export const getMcpServers = async () => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/mcp/servers`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch MCP servers: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching MCP servers:', error);
    throw error;
  }
};

/**
 * Fetches MCP tools from all connected servers
 * @returns Promise with the MCP tools information
 */
export const getMcpTools = async () => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/mcp/tools`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch MCP tools: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching MCP tools:', error);
    throw error;
  }
};

/**
 * Fetches tools for a specific MCP server
 * @param serverName Name of the MCP server
 * @returns Promise with the server's tools information
 */
export const getServerTools = async (serverName: string) => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/mcp/servers/${serverName}/tools`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch tools for server ${serverName}: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching tools for server ${serverName}:`, error);
    throw error;
  }
};

/**
 * Fetches the agent deny list
 * @returns Promise with the agent deny list
 */
export const getAgentDenyList = async (): Promise<{ denyList: string[] }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/agents/denylist`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch agent deny list: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching agent deny list:', error);
    throw error;
  }
};

/**
 * Fetches the user rules content
 * @returns Promise with the user rules content
 */
export const getUserRules = async (): Promise<{ content: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/rules/user`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user rules: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user rules:', error);
    throw error;
  }
};

/**
 * Updates the user rules content
 * @param content The new user rules content
 * @returns Promise with the update result
 */
export const updateUserRules = async (content: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/rules/user`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update user rules: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating user rules:', error);
    throw error;
  }
};

/**
 * Fetches the cluster rules content
 * @returns Promise with the cluster rules content
 */
export const getClusterRules = async (): Promise<{ content: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/rules/cluster`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch cluster rules: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching cluster rules:', error);
    throw error;
  }
};

/**
 * Updates the cluster rules content
 * @param content The new cluster rules content
 * @returns Promise with the update result
 */
export const updateClusterRules = async (content: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/rules/cluster`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update cluster rules: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating cluster rules:', error);
    throw error;
  }
};

/**
 * Fetches the kubeignore content
 * @returns Promise with the kubeignore content
 */
export const getKubeignore = async (): Promise<{ content: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/kubeignore`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch kubeignore: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching kubeignore:', error);
    throw error;
  }
};

/**
 * Updates the kubeignore content
 * @param content The new kubeignore content
 * @returns Promise with the update result
 */
export const updateKubeignore = async (content: string): Promise<{ success: boolean; message: string }> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/kubeignore`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update kubeignore: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating kubeignore:', error);
    throw error;
  }
};

/**
 * Fetches the agent web search setting from main config
 * @returns Promise with the agent web search setting
 */
export const getAgentWebSearch = async (): Promise<{ webSearch: boolean }> => {
  try {
    const config = await getSettings();
    return { webSearch: config.agents.webSearch };
  } catch (error) {
    console.error('Error fetching agent web search setting:', error);
    throw error;
  }
};

/**
 * Fetches the agent recon mode setting from main config
 * @returns Promise with the agent recon mode setting
 */
export const getAgentReconMode = async (): Promise<{ recon: boolean }> => {
  try {
    const config = await getSettings();
    return { recon: config.agents.recon };
  } catch (error) {
    console.error('Error fetching agent recon mode setting:', error);
    throw error;
  }
};

/**
 * Updates the agent recon mode setting
 * @param recon The new recon mode setting
 * @returns Promise with the updated settings
 */
export const updateAgentReconMode = async (recon: boolean): Promise<AgentKubeConfig> => {
  try {
    return await patchConfig({
      agents: { recon }
    });
  } catch (error) {
    console.error('Error updating agent recon mode setting:', error);
    throw error;
  }
};