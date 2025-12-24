import React, { useState, useEffect } from 'react';
import { getMcpConfig, updateMcpConfig, deleteMcpConfig } from '@/api/settings';
import { MCPServerConfig } from '@/types/mcp';
import { Button } from '@/components/ui/button';
import { getColorFromName } from '@/utils/getColorbyName';
import { Command, Link, Power, Terminal, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { WrenchScrewdriver } from '@/assets/icons';

interface MCPServer {
  name: string;
  config: MCPServerConfig;
}

interface MCPServerProps {
  onAddManually: () => void;
  onAddFromMarketplace: () => void;
}

const MCPServer = ({ onAddManually, onAddFromMarketplace }: MCPServerProps) => {

  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMcpConfig = async () => {
      try {
        setIsLoading(true);
        const mcpConfig = await getMcpConfig();

        // Transform mcpServers object to array
        const serversArray: MCPServer[] = Object.entries(mcpConfig.mcpServers || {}).map(([name, config]) => ({
          name,
          config: config as MCPServerConfig
        }));

        setMcpServers(serversArray);
      } catch (error) {
        console.error('Failed to load MCP config:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMcpConfig();
  }, []);

  const handleDelete = async (serverName: string) => {
    try {
      await deleteMcpConfig(serverName);
      // Refresh the servers list
      setMcpServers(mcpServers.filter(server => server.name !== serverName));
    } catch (error) {
      console.error('Failed to delete MCP server:', error);
    }
  };

  const handleToggleStatus = async (serverName: string, currentStatus: boolean) => {
    try {
      const serverToUpdate = mcpServers.find(s => s.name === serverName);
      if (!serverToUpdate) return;

      const updatedConfig = {
        ...serverToUpdate.config,
        enabled: !currentStatus
      };

      // Update the server config
      await updateMcpConfig({
        mcpServers: {
          [serverName]: updatedConfig
        }
      });

      // Update local state
      setMcpServers(mcpServers.map(server =>
        server.name === serverName
          ? { ...server, config: updatedConfig }
          : server
      ));
    } catch (error) {
      console.error('Failed to update MCP server:', error);
    }
  };


  if (isLoading) {
    return (
      <div className="bg-gray-400/20 dark:bg-gray-800/30 rounded-lg p-12 text-center">
        <div className="w-8 h-8 mx-auto mb-4 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></div>
        <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">Loading MCP servers...</h3>
      </div>
    );
  }

  if (mcpServers.length === 0) {
    return (
      <div className="bg-card/20 dark:bg-card/30 rounded-lg p-12 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 text-blue-500 mx-auto flex items-center justify-center">
            <WrenchScrewdriver size={36} />
          </div>
          <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">No MCP servers available</h3>
          <div className="flex justify-center space-x-3">
            <Button
              onClick={onAddManually}
              className="bg-accent/50 border-accent/50 text-white hover:bg-accent/50"
            >
              Add Manually
            </Button>
            <Button
              onClick={onAddFromMarketplace}
              className=""
            >
              Add from Marketplace
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* MCP Servers List */}
      <div className="rounded-lg border dark:border-gray-700/50">
        {mcpServers.map((server) => (
          <div
            key={server.name}
            className="bg-gray-500/10 dark:bg-gray-800/30 first:rounded-t-lg last:rounded-b-lg p-4 hover:bg-gray-500/20 dark:hover:bg-gray-800/50 transition-colors border-b dark:border-gray-700/50 last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1">
                <div className={`w-8 h-8 ${getColorFromName(server.name)} rounded-md flex items-center justify-center`}>
                  <span className="text-black font-semibold text-sm">
                    {server.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="dark:text-white font-medium text-sm">{server.name}</h4>
                    <span className="px-2 py-0.3 bg-gray-500/40 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 text-xs rounded">
                      {server.config.transport}
                    </span>
                    <span className={`px-2 py-0.3 text-xs rounded ${server.config.enabled
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-gray-500/20 text-gray-400'
                      }`}>
                      {server.config.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="flex items-center text-gray-700 dark:text-gray-400 text-xs ">
                    {server.config.transport === 'sse' && server.config.url ? (
                      <><Link className='h-3 w-3 mr-1' /> <span className='w-96 truncate'>{server.config.url}</span></>
                    ) : server.config.command ? (
                      <><Terminal className='h-3 w-3 mr-1' /> <span className='w-96 truncate'>{server.config.command} {server.config.args?.join(' ')}</span></>
                    ) : (
                      'No configuration available'
                    )}
                  </p>
                  {server.config.env && Object.keys(server.config.env).length > 0 && (
                    <p className="text-gray-700 dark:text-gray-400 text-xs mt-1">
                      Environment variables: {Object.keys(server.config.env).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <div className='space-x-1'>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(server.name)}
                  className="h-8 w-8 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 hover:text-red-600"
                  title="Delete server"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Switch
                  checked={server.config.enabled}
                  onCheckedChange={() => handleToggleStatus(server.name, server.config.enabled)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MCPServer;