import React, { useEffect, useState, useCallback } from 'react';
import { Terminal } from 'lucide-react';
import { Separator } from "@/components/ui/separator";
import CommandSpotlight from '../commandspotlight/commandspotlight.component';
import { getCommandSuggestion } from '@/api/spotlight';
import { debounce } from 'lodash';

interface CommandSuggestion {
  command: string;
}

interface CommandSuggestionsProps {
  query: string;
  onCommandSelect: (command: string) => void;
}

const CommandSuggestions: React.FC<CommandSuggestionsProps> = ({
  query,
  onCommandSelect
}) => {
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const debouncedFetch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const result = await getCommandSuggestion(searchQuery);
        setSuggestions(result);
      } catch (error) {
        console.error('Failed to fetch command suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    []
  );

  useEffect(() => {
    debouncedFetch(query);
    return () => {
      debouncedFetch.cancel();
    };
  }, [query, debouncedFetch]);

  if (isLoading || !suggestions.length) return null;

  return (
    <div className="py-1">
      <div className="px-4">
        <p className="text-sm mb-1 text-gray-500">Suggested Commands</p>
        <Separator className="bg-gray-200" />
      </div>
      <div className="border-t border-gray-200">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="group">
            <CommandSpotlight
              command={suggestion.command}
              icon={<Terminal className="w-4 h-4" />}
              onClick={() => onCommandSelect(suggestion.command)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CommandSuggestions;