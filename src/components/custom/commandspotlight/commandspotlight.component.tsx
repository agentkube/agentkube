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
      className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-accent-hover"
      onClick={onClick}
    >
      <div className="flex items-center">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-secondary">
          {icon}
        </div>
        <div className="ml-3">
          <code className="text-sm font-thin text-foreground">{command}</code>
        </div>
      </div>
      <div>
        <LogOut className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
};

export default CommandSpotlight;