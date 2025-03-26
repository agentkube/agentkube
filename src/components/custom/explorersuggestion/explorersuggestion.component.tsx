import React from 'react';
import { Command } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
interface ExplorerSuggestionProps {
  id: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
}

const ExplorerSuggestion: React.FC<ExplorerSuggestionProps> = ({
  id,
  title,
  description,
  icon = <Command className="w-4 h-4" />
}) => {
  const navigate = useNavigate();
  return (
    <a className="flex items-center px-4 py-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-800/20" onClick={() => navigate(`/dashboard/explore/${id}`)}>
      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-gray-300/60 dark:bg-gray-900">
        {icon}
      </div>
      <div className="ml-3">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-300">{title}</div>
        <div className="text-xs text-gray-500 dark:text-gray-500">{description}</div>
      </div>
    </a>
  );
};

export default ExplorerSuggestion;