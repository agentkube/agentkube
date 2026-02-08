import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { X, Plus, Info, Settings } from "lucide-react";
import ContextSetting from './settings/contextsetting.component';
import AgentSetting from './settings/agentsetting.component';
import MCPSetting from './settings/mcpsetting.component';
import RulesSetting from './settings/rulessetting.component';
import { AGENTKUBE } from '@/assets';

interface Agent {
  id: string;
  name: string;
  description: string;
  type: 'builtin' | 'custom';
  icon?: string;
}

const ChatSetting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('Agents');
  const tabs = ['Agents', 'MCP', 'Context', 'Rules'];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Agents':
        return <AgentSetting />;
      case 'MCP':
        return <MCPSetting />
      case 'Context':
        return <ContextSetting />;
      case 'Rules':
        return <RulesSetting />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="mt-2 flex">
        <div className="flex space-x-0 px-4 py-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-2 py-0.5 text-sm font-medium transition-colors rounded-md ${activeTab === tab
                ? 'bg-accent/20 dark:bg-accent/60 text-accent dark:text-white'
                : 'border-transparent'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 
          max-h-[90vh] overflow-y-auto
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
      ">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default ChatSetting;