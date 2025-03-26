import { AddMCPServer, MCPServerList } from '@/components/custom'
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Loader2 } from 'lucide-react'
import { getMcpServers, getMcpTools, getServerTools, getMcpConfig, updateMcpConfig } from '@/api/settings'
import { useToast } from '@/hooks/use-toast'
import { McpConfig } from '@/types/settings'

interface MCPServer {
  name: string;
  type: string;
  url: string;
  connected: boolean;
  tools_count: number;
  error?: string | null;
}

const MCPServerConfigPage = () => {
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [showAddServerDialog, setShowAddServerDialog] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerType, setNewServerType] = useState('sse');
  const [newServerUrl, setNewServerUrl] = useState('');
  const [editingServerIndex, setEditingServerIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  
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
        const serversArray: MCPServer[] = Object.entries(serversData.servers).map(([name, details]: [string, any]) => ({
          name,
          type: details.transport || 'sse',
          url: details.url || '',
          connected: details.connected || false,
          tools_count: details.tools_count || 0,
          error: details.error
        }));
        
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
      
      // Convert the servers array back to the format expected by the API
      const mcpServersObject: McpConfig['mcpServers'] = {};
      servers.forEach(server => {
        mcpServersObject[server.name] = {
          url: server.url,
          transport: server.type
        };
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
    setNewServerType('sse');
    setNewServerUrl('');
    setIsEditing(false);
    setEditingServerIndex(null);
    setShowAddServerDialog(true);
  };

  const handleEditServer = (server: MCPServer, index: number) => {
    setNewServerName(server.name);
    setNewServerType(server.type);
    setNewServerUrl(server.url);
    setIsEditing(true);
    setEditingServerIndex(index);
    setShowAddServerDialog(true);
  };

  const handleDeleteServer = async (index: number) => {
    const updatedServers = [...mcpServers];
    updatedServers.splice(index, 1);
    setMcpServers(updatedServers);
    
    // Save the updated configuration
    await saveMcpServers(updatedServers);
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
        tools_count: toolsData.count || 0,
        error: null
      };
      
      setMcpServers(updatedServers);
      
      toast({
        title: "Server reloaded",
        description: `Successfully refreshed ${serverName} with ${toolsData.count} tools.`,
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

  const addNewServer = async () => {
    if (newServerName && newServerUrl) {
      let updatedServers: MCPServer[];
      
      if (isEditing && editingServerIndex !== null) {
        // Update existing server
        updatedServers = [...mcpServers];
        updatedServers[editingServerIndex] = {
          name: newServerName,
          type: newServerType,
          url: newServerUrl,
          connected: false, // Reset connection status
          tools_count: 0    // Reset tools count
        };
      } else {
        // Add new server
        updatedServers = [...mcpServers, {
          name: newServerName,
          type: newServerType,
          url: newServerUrl,
          connected: false,
          tools_count: 0
        }];
      }
      
      // Save the updated configuration
      const success = await saveMcpServers(updatedServers);
      
      if (success) {
        setMcpServers(updatedServers);
        setShowAddServerDialog(false);
        setIsEditing(false);
        setEditingServerIndex(null);
        
        // Refetch servers to get connection status
        setTimeout(async () => {
          try {
            const serversData = await getMcpServers();
            const serversArray: MCPServer[] = Object.entries(serversData.servers).map(([name, details]: [string, any]) => ({
              name,
              type: details.transport || 'sse',
              url: details.url || '',
              connected: details.connected || false,
              tools_count: details.tools_count || 0,
              error: details.error
            }));
            
            setMcpServers(serversArray);
          } catch (error) {
            console.error('Failed to refresh servers:', error);
          }
        }, 1000);
      }
    } else {
      toast({
        title: "Missing information",
        description: "Please provide both a name and URL for the MCP server.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full p-8">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
        <span className="ml-2 text-gray-500">Loading MCP server configuration...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-gray-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-2xl font-medium text-black dark:text-white">MCP Servers</h3>
          <p className="text-gray-700 dark:text-gray-400 text-sm mt-1">
            Model Context Protocol is a way to offer new tools to Agentkube Agent. You can find more information about MCP in Agentkube here.
          </p>
        </div>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white flex items-center"
          onClick={openAddServerDialog}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 size={16} className="mr-1 animate-spin" />
          ) : (
            <Plus size={16} className="mr-1" />
          )}
          Add new MCP server
        </Button>
      </div>

      {mcpServers.length === 0 ? (
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
        onServerNameChange={setNewServerName}
        onServerTypeChange={setNewServerType}
        onServerUrlChange={setNewServerUrl}
        onAdd={addNewServer}
        isEditing={isEditing}
        isSaving={isSaving}
      />
    </div>
  )
}

export default MCPServerConfigPage