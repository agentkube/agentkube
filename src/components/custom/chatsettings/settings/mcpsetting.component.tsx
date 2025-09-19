import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Plus, Search, ChevronDown, HelpCircle, Clock, LaptopMinimal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiModelcontextprotocol } from '@icons-pack/react-simple-icons';
import { MCPTool, MCPMarketplace, MCP_MARKETPLACE_URL } from '@/constants/mcp-marketplace.constant';
import { getMCPIcon } from '@/utils/mcp-icon-map.utils';
import AddMCPConfig from './addmcpconfig.component';
import AddMCPManualDialog from './addmcpmanualdialog.component';
import MCPServer from '../mcp/mcpserver.component';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const MCPSetting = () => {
  const [currentView, setCurrentView] = useState<'main' | 'marketplace'>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState<MCPTool | null>(null);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [mcpTools, setMcpTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMarketplaceData = async () => {
      setLoading(true);
      try {
        const response = await fetch(MCP_MARKETPLACE_URL);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: MCPMarketplace = await response.json();
        
        const transformedTools: MCPTool[] = data.servers.map(server => {
          const iconData = getMCPIcon(server.slug);
          return {
            id: server.slug,
            name: server.name,
            description: server.description,
            icon: iconData.icon,
            iconBg: iconData.iconBg,
            type: server.configuration.command ? 'Local' : 'Remote',
            category: server.category,
            tags: server.tags,
            creator: server.creator,
            repository: server.repository,
            configuration: server.configuration
          };
        });
        
        setMcpTools(transformedTools);
      } catch (error) {
        console.error('Error fetching marketplace data:', error);
        // Fallback to empty array if fetch fails
        setMcpTools([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMarketplaceData();
  }, []);

  const filteredTools = mcpTools.filter(tool =>
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddFromMarketplace = () => {
    setCurrentView('marketplace');
  };

  const handleAddManually = () => {
    setShowManualDialog(true);
  };

  const handleBackToMain = () => {
    setCurrentView('main');
  };

  if (currentView === 'marketplace') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4">
          <button
            onClick={handleBackToMain}
            className="dark:text-white hover:text-gray-300 transition-colors"
          >
            <h2 className="text-xl font-semibold">MCP</h2>
          </button>
          <span className="text-gray-400">/</span>
          <h3 className="text-xl font-medium">Marketplace</h3>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10  border-gray-700"
          />
        </div>

        {/* MCP Tools List */}
        <div className='rounded-lg border dark:border-gray-700/50'>
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
              <p className="mt-2 text-gray-600 dark:text-gray-400">Loading marketplace...</p>
            </div>
          ) : filteredTools.length > 0 ? (
            filteredTools.map((tool) => (
            <div
              key={tool.id}
              className="bg-gray-500/10 dark:bg-gray-800/30 first:rounded-t-lg last:rounded-b-lg p-4 hover:bg-gray-500/20  dark:hover:bg-gray-800/50 transition-colors border-b dark:border-gray-700/50 last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 flex-1">
                  <div className={`w-8 h-8 ${tool.iconBg} rounded-md flex items-center justify-center`}>
                    <span className="text-black font-semibold text-sm">{tool.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h4 className="dark:text-white font-medium text-sm">{tool.name}</h4>
                    </div>
                    <p className="text-gray-700 dark:text-gray-400 text-xs w-96 truncate">{tool.description}</p>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                  variant="outline"
                  size="sm"
                  className="bg-black dark:bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                  onClick={() => setShowAddDialog(tool)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                  </TooltipTrigger>
                  <TooltipContent className='p-1' side='bottom'>
                    <p>Add {tool.name}</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            ))
          ) : (
            <div className="p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">No MCP tools found{searchQuery && ` matching "${searchQuery}"`}</p>
            </div>
          )}
        </div>
        {showAddDialog && (
          <AddMCPConfig
            tool={showAddDialog}
            onClose={() => setShowAddDialog(null)}
            onSave={(config) => {
              console.log('Saving MCP config:', config);
              setShowAddDialog(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <SiModelcontextprotocol className='text-black dark:text-neutral-200' />
          <h2 className="text-2xl font-medium">MCP</h2>
        </div>
        <div className="relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="border-gray-600 text-white hover:bg-gray-600 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 dark:bg-[#0B0D13]/60 backdrop-blur-sm ">
              <DropdownMenuItem onClick={handleAddManually}>
                Add Manually
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleAddFromMarketplace}>
                Add From Marketplace
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Empty State */}
      <MCPServer 
          onAddManually={handleAddManually}
          onAddFromMarketplace={handleAddFromMarketplace}
        />
      {/* <div className="bg-gray-400/20 dark:bg-gray-800/30 rounded-lg p-12 ">

        <div className="flex justify-center space-x-3">
          <Button
            onClick={handleAddManually}
            variant="outline"
            className="bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
          >
            Add Manually
          </Button>
          <Button
            onClick={handleAddFromMarketplace}
            className="bg-white dark:bg-white text-black dark:text-black hover:bg-gray-200"
          >
            Add from Marketplace
          </Button>
        </div>
      </div> */}

      {/* Manual Dialog - Only in Main View */}
      {showManualDialog && (
        <AddMCPManualDialog
          onClose={() => setShowManualDialog(false)}
          onSave={(config) => {
            console.log('Saving manual MCP config:', config);
            setShowManualDialog(false);
          }}
        />
      )}
      </div>
    </TooltipProvider>
  );
};

export default MCPSetting;