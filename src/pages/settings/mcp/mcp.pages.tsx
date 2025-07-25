import { AddMCPServer, MCPServerList } from '@/components/custom'
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Loader2, RotateCw } from 'lucide-react'
import { getMcpServers, getServerTools, updateMcpConfig, deleteMcpConfig } from '@/api/settings'
import { useToast } from '@/hooks/use-toast'

// Update this interface in your types/settings.ts
interface MCPServerConfig {
  url?: string;
  transport?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

interface MCPServer {
  name: string;
  type: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  connected: boolean;
  tools_count: number;
  error?: string | null;
}

const MCPServerConfigPage = () => {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [showAddServerDialog, setShowAddServerDialog] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerType, setNewServerType] = useState('remote');  // Changed from 'sse' to 'remote'
  const [newServerUrl, setNewServerUrl] = useState('');
  const [newServerCommand, setNewServerCommand] = useState('');
  const [newServerArgs, setNewServerArgs] = useState('');
  const [editingServerIndex, setEditingServerIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newServerEnv, setNewServerEnv] = useState<Record<string, string>>({});
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const { toast } = useToast();

  // Fetch MCP servers on component mount
  useEffect(() => {
    const fetchMcpServers = async () => {
      try {
        setIsLoading(true);
        const serversData = await getMcpServers();

        // Convert the servers object to an array for easier manipulation in the UI
        const serversArray: MCPServer[] = serversData.map((server: any) => {
          let serverType = server.type === 'stdio' ? 'process' : 'remote';
          
          return {
            name: server.name,
            type: serverType,
            url: server.url || '',
            command: server.command || '',
            args: server.args || [],
            env: server.env || {},
            connected: server.connected || false,
            tools_count: server.tools_count || 0,
            error: server.error
          };
        });

        setMcpServers(serversArray);
      } catch (error) {
        console.error('Failed to load MCP servers:', error);
        toast({
          title: "Error loading MCP servers",
          description: "Could not load MCP server configuration. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMcpServers();
  }, [toast]);

  // Save MCP server configuration
  const saveMcpServers = async (servers: MCPServer[]) => {
    try {
      setIsSaving(true);

      const mcpServersObject: Record<string, MCPServerConfig> = {};

      servers.forEach(server => {
        if (server.type === 'remote') {
          // For remote servers (using SSE)
          mcpServersObject[server.name] = {
            url: server.url || '',  // Add fallback to prevent undefined
            transport: 'sse',
            enabled: false,
          };
        } else if (server.type === 'process') {
          // For process-based servers (using stdio)
          mcpServersObject[server.name] = {
            command: server.command || '',
            args: server.args || [],
            env: server.env || {},
            transport: 'stdio',
            enabled: false,
          };
        }
      });

      // Update the configuration
      await updateMcpConfig({
        mcpServers: mcpServersObject
      });

      toast({
        title: "MCP servers saved",
        description: "Your MCP server configuration has been updated.",
      });

      return true;
    } catch (error) {
      console.error('Failed to save MCP servers:', error);
      toast({
        title: "Error saving servers",
        description: "Could not save MCP server configuration. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const openAddServerDialog = () => {
    setNewServerName('');
    setNewServerType('remote');  // Changed from 'sse' to 'remote'
    setNewServerUrl('');
    setNewServerCommand('');
    setNewServerArgs('');
    setIsEditing(false);
    setEditingServerIndex(null);
    setShowAddServerDialog(true);
  };

  const handleEditServer = (server: MCPServer, index: number) => {
    setNewServerName(server.name);
    setNewServerType(server.type);
    setNewServerUrl(server.url || '');
    setNewServerCommand(server.command || '');
    setNewServerArgs(server.args ? server.args.join(' ') : '');
    setNewServerEnv(server.env || {}); // Add this line
    setIsEditing(true);
    setEditingServerIndex(index);
    setShowAddServerDialog(true);
  };

  const handleDeleteServer = async (index: number) => {
    const updatedServers = [...mcpServers];
    const serverName = mcpServers[index].name;
    updatedServers.splice(index, 1);

    try {
      await deleteMcpConfig(serverName);
      setMcpServers(updatedServers);

      toast({
        title: "Server deleted",
        description: `MCP server "${serverName}" was deleted successfully.`
      });
    } catch (error) {
      console.error('Failed to delete server:', error);
      toast({
        title: "Error deleting server",
        description: "Could not delete the server. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleReloadServer = async (index: number) => {
    try {
      const serverName = mcpServers[index].name;
      toast({
        title: "Reloading server",
        description: `Reloading server configuration for ${serverName}...`,
      });
  
      // Fetch server tools to test connection
      const toolsData = await getServerTools(serverName);
      
      // Update the server in the list
      const updatedServers = [...mcpServers];
      updatedServers[index] = {
        ...updatedServers[index],
        connected: true,
        tools_count: toolsData.length || 0,  // Changed from toolsData.count to toolsData.length
        error: null
      };
  
      setMcpServers(updatedServers);
  
      toast({
        title: "Server reloaded",
        description: `Successfully refreshed ${serverName} with ${toolsData.length} tools.`,  // Changed here too
      });
    } catch (error) {
      console.error('Error reloading server:', error);
      toast({
        title: "Failed to reload server",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  const closeAddServerDialog = () => {
    setShowAddServerDialog(false);
    setIsEditing(false);
    setEditingServerIndex(null);
  };

  const handleReloadAllServers = async () => {
    try {
      setIsLoading(true);
      const serversData = await getMcpServers();

      // Convert the servers object to an array for easier manipulation in the UI
      const serversArray: MCPServer[] = serversData.map((server: any) => {
        let serverType = server.type === 'stdio' ? 'process' : 'remote';
        
        return {
          name: server.name,
          type: serverType,
          url: server.url || '',
          command: server.command || '',
          args: server.args || [],
          env: server.env || {},
          connected: server.connected || false,
          tools_count: server.tools_count || 0,
          error: server.error
        };
      });

      setMcpServers(serversArray);

      toast({
        title: "Servers reloaded",
        description: `Successfully reloaded ${serversArray.length} MCP servers.`
      });
    } catch (error) {
      console.error('Failed to reload MCP servers:', error);
      toast({
        title: "Failed to reload servers",
        description: "Could not reload MCP servers. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addNewServer = async () => {
    if (newServerName) {
      let serverConfig: Partial<MCPServer> = {
        name: newServerName,
        type: newServerType,
        connected: false,
        tools_count: 0
      };

      // Add type-specific fields
      if (newServerType === 'remote') {
        if (!newServerUrl) {
          toast({
            title: "Missing information",
            description: "Please provide a URL for the remote MCP server.",
            variant: "destructive",
          });
          return;
        }
        serverConfig.url = newServerUrl;
      } else if (newServerType === 'process') {
        if (!newServerCommand) {
          toast({
            title: "Missing information",
            description: "Please provide a command for the process MCP server.",
            variant: "destructive",
          });
          return;
        }
        serverConfig.command = newServerCommand;
        serverConfig.args = newServerArgs.split(' ').filter(arg => arg.trim() !== '');
        serverConfig.env = newServerEnv;
      }

      let updatedServers: MCPServer[];

      if (isEditing && editingServerIndex !== null) {
        // Update existing server
        updatedServers = [...mcpServers];
        updatedServers[editingServerIndex] = serverConfig as MCPServer;
      } else {
        // Add new server
        updatedServers = [...mcpServers, serverConfig as MCPServer];
      }

      // Save the updated configuration
      const success = await saveMcpServers(updatedServers);
      if (success) {
        setMcpServers(updatedServers);
        setShowAddServerDialog(false);
        setIsEditing(false);
        setEditingServerIndex(null);
      }
    } else {
      toast({
        title: "Missing information",
        description: "Please provide a name for the MCP server.",
        variant: "destructive",
      });
    }
  };


  return (
    <div className="p-6 space-y-6 text-gray-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-4xl font-[Anton] uppercase text-gray-700/20 dark:text-gray-200/20 font-medium">MCP Servers</h3>
          <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
            Model Context Protocol is a way to offer new tools to Agentkube Agent. You can find more information about MCP in Agentkube here.
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            className="text-gray-700"
            variant="outline"
            onClick={handleReloadAllServers}
            disabled={isSaving || isLoading}
          >
            {isLoading ? (
              <Loader2 size={16} className=" animate-spin" />
            ) : (
              <RotateCw size={16} className="" />
            )}
          </Button>
          <Button
            className="flex items-center"
            onClick={openAddServerDialog}
            disabled={isSaving || isLoading}
          >
            {isSaving ? (
              <Loader2 size={16} className="mr-1 animate-spin" />
            ) : (
              <Plus size={16} className="mr-1" />
            )}
            Add new MCP server
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-gray-100 dark:bg-gray-800/50 rounded-md p-10 text-center flex flex-col items-center justify-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          <p className="text-gray-600 dark:text-gray-400">
            Loading MCP server configuration...
          </p>
        </div>
      ) : mcpServers.length === 0 ? (
        <div className="bg-gray-100 dark:bg-gray-800/50 rounded-md p-6 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            No MCP servers configured. Add a server to get started.
          </p>
        </div>
      ) : (
        <MCPServerList
          servers={mcpServers}
          onEdit={handleEditServer}
          onDelete={handleDeleteServer}
          onReload={handleReloadServer}
        />
      )}

      <AddMCPServer
        open={showAddServerDialog}
        onClose={closeAddServerDialog}
        serverName={newServerName}
        serverType={newServerType}
        serverUrl={newServerUrl}
        serverCommand={newServerCommand}
        serverArgs={newServerArgs}
        serverEnv={newServerEnv}
        onServerNameChange={setNewServerName}
        onServerTypeChange={setNewServerType}
        onServerUrlChange={setNewServerUrl}
        onServerCommandChange={setNewServerCommand}
        onServerArgsChange={setNewServerArgs}
        onServerEnvChange={setNewServerEnv}
        onAdd={addNewServer}
        isEditing={isEditing}
        isSaving={isSaving}
      />
    </div>
  )
}

export default MCPServerConfigPage