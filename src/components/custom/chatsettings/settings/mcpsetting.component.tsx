import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Plus, Search, ChevronDown, HelpCircle, Clock, LaptopMinimal } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SiClaude, SiDask, SiFigma, SiGithub, SiGitlab, SiGoogledrive, SiGooglemaps, SiPostgresql, SiPuppeteer, SiSlack } from '@icons-pack/react-simple-icons';
import { AWS_PROVIDER } from '@/assets/providers';
import AddMCPConfig from './addmcpconfig.component';
import MCPServer from '../mcp/mcpserver.component';

interface MCPTool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactElement;
  iconBg: string;
  type?: 'Local' | 'Remote';
}

const MCPSetting = () => {
  const [currentView, setCurrentView] = useState<'main' | 'marketplace'>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState<MCPTool | null>(null);

  const mcpTools: MCPTool[] = [
    {
      id: 'puppeteer',
      name: 'Puppeteer',
      description: 'Enables browser automation and web scraping with Puppeteer, allowing LLMs to interact wi...',
      icon: <SiPuppeteer className='h-4 w-4' />,
      iconBg: 'bg-blue-500',
      type: 'Local'
    },
    {
      id: 'postgresql',
      name: 'PostgreSQL',
      description: 'Provides read-only access to PostgreSQL databases, enabling LLMs to inspect database s...',
      icon: <SiPostgresql className='h-4 w-4' />,
      iconBg: 'bg-emerald-500',
      type: 'Local'
    },
    {
      id: 'github',
      name: 'GitHub',
      description: 'Integrates with the GitHub API, enabling repository management, file operations, issue trac...',
      icon: <SiGithub className='h-4 w-4' />,
      iconBg: 'bg-neutral-400',
      type: 'Local'
    },
    {
      id: 'figma',
      name: 'Figma AI Bridge',
      description: 'Offers tools to view, comment on, and analyze Figma designs, ensuring precise implementa...',
      icon: <SiFigma className='h-4 w-4' />,
      iconBg: 'bg-emerald-600',
      type: 'Local'
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Enables AI assistants to interact with Slack workspaces, providing tools for messaging, cha...',
      icon: <SiSlack className='h-4 w-4' />,
      iconBg: 'bg-emerald-500'
    },
    {
      id: 'gitlab',
      name: 'GitLab',
      description: 'Enables comprehensive GitLab project management including file operations, issue trackin...',
      icon: <SiGitlab className='h-4 w-4' />,
      iconBg: 'bg-orange-600'
    },
    {
      id: 'time',
      name: 'Time',
      description: 'Provides time and timezone conversion capabilities using IANA timezone names, with auto...',
      icon: <Clock className='h-4 w-4' />,
      iconBg: 'bg-cyan-500'
    },
    {
      id: 'googlemaps',
      name: 'Google Maps',
      description: 'Location services, directions, and place details',
      icon: <SiGooglemaps className='h-4 w-4' />,
      iconBg: 'bg-purple-500'
    },
    {
      id: 'aws',
      name: 'AWS Knowledge Base',
      description: 'Retrieves information from AWS Knowledge Base using Bedrock Agent Runtime, supporting...',
      icon: <img src={AWS_PROVIDER} className='h-4' />,
      iconBg: 'bg-neutral-200'
    },
    {
      id: 'googledrive',
      name: 'Google Drive',
      description: 'File access and search capabilities for Google Drive',
      icon: <SiGoogledrive className='h-4 w-4' />,
      iconBg: 'bg-red-400'
    }
  ];

  const filteredTools = mcpTools.filter(tool =>
    tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddFromMarketplace = () => {
    setCurrentView('marketplace');
  };

  const handleAddManually = () => {
    // Handle manual add logic here
    console.log('Add manually clicked');
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
          {filteredTools.map((tool) => (
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
                      {tool.type && (
                        <span className="px-1 py-0.5 bg-gray-500/40 bg-gray-700/10 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 text-xs rounded flex items-center space-x-1">
                          <LaptopMinimal className='text-blue-500 h-3 w-3' />

                          <span>{tool.type}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 dark:text-gray-400 text-xs w-96 truncate">{tool.description}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-black dark:bg-gray-700 border-gray-600 text-white hover:bg-gray-600"
                  onClick={() => setShowAddDialog(tool)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <SiClaude className='text-[#D97757]' />
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
            <DropdownMenuContent align="end" className="w-48 dark:bg-[#0B0D13]/60 backdrop-blur-sm">
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
    </div>
  );
};

export default MCPSetting;