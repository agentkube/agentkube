// pages/settings/SettingsLayout.tsx
import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SettingSidebar } from '@/components/custom';

const Settings: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev);
  };

  return (
    <div className="flex w-full">
      <SettingSidebar isCollapsed={isCollapsed} toggleCollapse={toggleCollapse} />
      
      <div className={`flex-1 
          max-h-[92vh] overflow-y-auto
          
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50 transition-all duration-300 ${isCollapsed ? 'ml-16' : 'ml-2'}`}>
        <div className="py-6 px-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Settings;