// components/settings/SettingSidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Settings, Users, Monitor, Code, HelpCircle, Folder, Keyboard, ChartColumnBig, Server, RefreshCcwDot, Database, Shield, Binoculars, Home, ArrowLeft, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface SettingSidebarProps {
  isCollapsed: boolean;
  toggleCollapse: () => void;
}

interface SidebarItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

const SettingSidebar: React.FC<SettingSidebarProps> = ({ isCollapsed, toggleCollapse }) => {
  const sidebarItems: SidebarItem[] = [
    { icon: <Settings size={15} />, label: 'General', path: '/settings/general' },
    { icon: <ChartColumnBig size={15} />, label: 'Models', path: '/settings/models' },
    { icon: <Users size={15} />, label: 'Account', path: '/settings/account' },
    { icon: <Folder size={15} />, label: 'Kubeconfig', path: '/settings/kubeconfig' },
    { icon: <Keyboard size={15} />, label: 'Shortcuts', path: '/settings/shortcuts' },
    { icon: <Monitor size={15} />, label: 'Appearance', path: '/settings/appearance' },
    { icon: <Server size={15} />, label: 'MCP', path: '/settings/mcp' },
    { icon: <Network size={15} />, label: 'Network', path: '/settings/networks' },

    // TODO: Release v1.0.6
    // { icon: <Shield size={15} />, label: 'Image Scans', path: '/settings/imagescans' },
    // { icon: <Binoculars size={15} />, label: 'Watcher', path: '/settings/watcher' },
    { icon: <Database size={15} />, label: 'Indexing', path: '/settings/indexing' },


    // { icon: <Code size={15} />, label: 'Developer', path: '/settings/developer' },
    { icon: <HelpCircle size={15} />, label: 'Help & Support', path: '/settings/support' },
    { icon: <RefreshCcwDot size={15} />, label: 'Updates', path: '/settings/updates' },
  ];

  return (
    <div className={cn(
      "h-[91vh] flex flex-col transition-all duration-300  rounded-2xl",
      isCollapsed ? "w-16" : "w-64"
    )}>
      <div className="p-4 flex items-center justify-between dark:border-gray-700">
        {!isCollapsed && <h2 className="text-xl font-medium dark:text-white">Settings</h2>}
        <button
          onClick={toggleCollapse}
          className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-white"
        >
          {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <div className="px-2 pb-4">
        <NavLink
          to="/"
          className={({ isActive }) => cn(
            "flex justify-between items-center px-2 py-2 rounded-lg transition-colors text-sm w-full",
            "hover:bg-gray-200 dark:hover:bg-gray-800/40 text-gray-700 dark:text-gray-300",
            !isCollapsed && "border"
          )}
        >
          
            <Home className='h-5 w-5' />
            {!isCollapsed && <span>Return to Home</span>}
        </NavLink>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-2">
          {sidebarItems.map((item, index) => (
            <li key={index}>
              <NavLink
                to={item.path}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                  isActive
                    ? "bg-gray-200 dark:bg-gray-800/50 text-black dark:text-gray-100"
                    : "hover:bg-gray-200 dark:hover:bg-gray-800/40 text-gray-700 dark:text-gray-300"
                )}
              >
                {item.icon}
                {!isCollapsed && <span>{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default SettingSidebar;