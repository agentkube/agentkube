import React, { useState, useEffect } from 'react';
import { Pencil, RotateCw, Trash2, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getServerTools } from '@/api/settings';

interface MCPTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
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
  tools?: MCPTool[];
  error?: string | null;
}

interface MCPServerListProps {
  servers: MCPServer[];
  onEdit: (server: MCPServer, index: number) => void;
  onDelete: (index: number) => void;
  onReload: (index: number) => void;
}

const MCPServerList: React.FC<MCPServerListProps> = ({ servers, onEdit, onDelete, onReload }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<number | null>(null);
  const [serverTools, setServerTools] = useState<Record<string, MCPTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<Record<string, boolean>>({});

  // Fetch tools for all servers on mount
  useEffect(() => {
    const fetchToolsForAllServers = async () => {
      for (const server of servers) {
        if (server.connected && server.tools_count > 0 && !serverTools[server.name]) {
          setLoadingTools(prev => ({ ...prev, [server.name]: true }));
          try {
            const toolsData = await getServerTools(server.name);
            setServerTools(prev => ({
              ...prev,
              [server.name]: toolsData.tools || []
            }));
          } catch (error) {
            console.error(`Error fetching tools for ${server.name}:`, error);
          } finally {
            setLoadingTools(prev => ({ ...prev, [server.name]: false }));
          }
        }
      }
    };

    fetchToolsForAllServers();
  }, [servers]);

  if (servers.length === 0) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800/30 rounded-[0.5rem] p-3 text-sm text-gray-500 dark:text-gray-400">
        No MCP servers found. Click the + button to add one.
      </div>
    );
  }

  const handleEditClick = (server: MCPServer, index: number) => {
    onEdit(server, index);
  };

  const handleReloadClick = (index: number) => {
    onReload(index);

    // Reload tools for this server
    const server = servers[index];
    if (server && server.connected) {
      setLoadingTools(prev => ({ ...prev, [server.name]: true }));
      getServerTools(server.name)
        .then(toolsData => {
          setServerTools(prev => ({
            ...prev,
            [server.name]: toolsData.tools || []
          }));
        })
        .catch(error => {
          console.error(`Error reloading tools for ${server.name}:`, error);
        })
        .finally(() => {
          setLoadingTools(prev => ({ ...prev, [server.name]: false }));
        });
    }
  };

  const handleDeleteClick = (index: number) => {
    setServerToDelete(index);
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    if (serverToDelete !== null) {
      onDelete(serverToDelete);
      setShowDeleteDialog(false);
      setServerToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowDeleteDialog(false);
    setServerToDelete(null);
  };

  // Helper function to render tool names
  const renderToolNames = (server: MCPServer) => {
    if (!server.connected || server.tools_count === 0) {
      return null;
    }

    if (loadingTools[server.name]) {
      return (
        <div className="text-gray-500 dark:text-gray-400 text-xs mt-1">
          Loading tools...
        </div>
      );
    }

    const tools = serverTools[server.name];
    if (!tools || tools.length === 0) {
      return (
        <div className="text-gray-500 dark:text-gray-400 text-xs mt-1">
          No tools information available
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {tools.map((tool, idx) => (
          <span
            key={idx}
            className="text-xs font-mono bg-gray-200 dark:bg-gray-900 border dark:border-gray-800 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300"
          >
            {tool.name}
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-2">
        {servers.map((server, index) => (
          <div key={index} className="px-3 py-2 bg-gray-100 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800/50 rounded-md">
            <div className='flex items-center justify-between'>
              <div className="flex items-center">
                <div className={`w-2 h-2 rounded-full ${server.connected ? 'bg-green-500' : 'bg-red-500'} mr-2`}></div>
                <span className="font-medium text-black dark:text-white mr-2">{server.name}</span>
                <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 rounded-md ml-1">
                  {server.type}
                </span>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800"
                  onClick={() => handleEditClick(server, index)}
                  aria-label="Edit server"
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800"
                  onClick={() => handleReloadClick(index)}
                  aria-label="Reload server"
                >
                  <RotateCw size={12} />
                </button>
                <button
                  className="p-1 text-gray-500 hover:text-red-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800"
                  onClick={() => handleDeleteClick(index)}
                  aria-label="Delete server"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 flex items-center">
              <span className="inline-flex items-center">
                <span className="text-gray-400 mr-1">
                  <Wrench size={14} className='mr-1' />
                </span>
                {server.tools_count > 0 ? (
                  <>
                    {renderToolNames(server)}
                  </>
                ) : (
                  <span>No tools available</span>
                )}
              </span>
            </div>

            {/* Always display tool names without requiring expansion */}

            <div className="mt-2 text-sm text-gray-500 dark:text-gray-400 flex items-center space-x-2">
              <span className="text-gray-500 dark:text-gray-400">Connection:</span>
              {server.type === "remote" ? (
                <span className="text-gray-700 dark:text-gray-300 dark:bg-black border dark:border-gray-800 py-0.5 px-2 rounded-[0.3rem]">{server.url}</span>
              ) : (
                <span className="text-gray-700 dark:text-gray-300 dark:bg-black border dark:border-gray-800 py-0.5 px-2 rounded-[0.3rem]">
                  {server.command} {server.args?.join(' ')}
                </span>
              )}
            </div>

            {server.type === "process" && server.env && Object.keys(server.env).length > 0 && (
              <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="text-gray-500 dark:text-gray-400 block mb-1">Environment:</span>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(server.env).map(([key, value], idx) => (
                    <span
                      key={idx}
                      className="text-xs font-mono bg-gray-200 dark:bg-gray-900 border dark:border-gray-800 px-1.5 py-0.5 rounded text-gray-700 dark:text-gray-300"
                      title={`${value}`}
                    >
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {server.error ? (
              <div className="mt-2 text-sm text-red-500 flex items-center">
                <span className="inline-flex items-center">
                  <Trash2 size={12} className="mr-1" /> {server.error}
                </span>
              </div>
            ) : server.connected ? (
              <div className="mt-2 text-sm text-green-500 flex items-center">
                <span className="inline-flex items-center">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div>
                  Connected
                </span>
              </div>
            ) : (
              <div className="mt-2 text-sm text-red-500 flex items-center">
                <span className="inline-flex items-center">
                  <div className="w-2 h-2 rounded-full bg-red-500 mr-1"></div>
                  Disconnected
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-[#0B0D13] border-gray-300 dark:border-gray-900">
          <DialogHeader>
            <DialogTitle className="text-black dark:text-white">Confirm Delete</DialogTitle>
          </DialogHeader>

          <div className="py-4">
            <p className="text-gray-700 dark:text-gray-300">
              Are you sure you want to delete this MCP server?
              {serverToDelete !== null && servers[serverToDelete] && (
                <span className="font-semibold block mt-2">
                  "{servers[serverToDelete].name}"
                </span>
              )}
            </p>
          </div>

          <DialogFooter className="flex justify-between mt-4">
            <Button
              variant="ghost"
              onClick={cancelDelete}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800"
            >
              Cancel
            </Button>

            <Button
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MCPServerList;