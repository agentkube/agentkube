import React from 'react';
import { Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
interface SpotlightSuggestionProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  link?: string;
}

const SpotlightSuggestion: React.FC<SpotlightSuggestionProps> = ({
  title,
  description,
  icon = <Command className="w-4 h-4" />,
  link = '/'
}) => {
  const navigate = useNavigate();
  return (
    <div className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800/20" onClick={() => navigate(link)}>
      <div className="flex items-center justify-center w-8 h-8 rounded-md text-gray-500 dark:text-gray-400 bg-gray-300 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-800/50">
        {icon}
      </div>
      <div className="ml-3">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-300">{title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-500">{description}</div>
      </div>
    </div>
  );
};

export default SpotlightSuggestion;