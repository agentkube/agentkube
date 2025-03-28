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
    // Get current settings first
    const currentSettings = await getSettings();
    
    // Create updated settings with the new section values
    const updatedSettings = {
      ...currentSettings,
      [section]: {
        ...currentSettings[section],
        ...values,
      },
    };
    
    // Update settings
    return await updateSettings(updatedSettings);
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
      body: JSON.stringify(settings),
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
 * @param mcpConfig Updated MCP configuration
 * @returns Promise with the updated MCP configuration
 */
export const updateMcpConfig = async (mcpConfig: {
  mcpServers: {
    [key: string]: {
      url: string;
      transport?: string;
    };
  };
}): Promise<any> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_URL}/api/mcp`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mcpConfig),
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