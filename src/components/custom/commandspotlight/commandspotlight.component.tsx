import React from 'react';
import { LogOut, Terminal } from 'lucide-react';

interface CommandSpotlightProps {
  command: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

const CommandSpotlight: React.FC<CommandSpotlightProps> = ({
  command,
  icon = <Terminal className="w-4 h-4" />,
  onClick
}) => {
  return (
    <div 
      className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800/20"
      onClick={onClick}
    >
      <div className="flex items-center">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gray-300/60 dark:bg-gray-500/10">
          {icon}
        </div>
        <div className="ml-3">
          <code className="text-sm font-thin text-gray-900 dark:text-gray-300">{command}</code>
        </div>
      </div>
      <div>
        <LogOut className="w-4 h-4 text-gray-600 dark:text-gray-400" />
      </div>
    </div>
  );
};

export default CommandSpotlight;