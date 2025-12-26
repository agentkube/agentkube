import React, { useState } from 'react';
import { Brain, ChevronDown, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

interface ReasoningEffortProps {
  value: ReasoningEffortLevel;
  onChange: (value: ReasoningEffortLevel) => void;
}

const reasoningOptions: { value: ReasoningEffortLevel; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const ReasoningEffort: React.FC<ReasoningEffortProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentOption = reasoningOptions.find(opt => opt.value === value);

  return (
    <TooltipProvider>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger className='rounded-md' asChild>
              <button
                className="flex items-center gap-2 px-2 py-1 h-auto text-xs text-muted-foreground hover:text-foreground"
              >
                <Brain className="h-3.5 w-3.5" />
                <span>{currentOption?.label || 'Medium'}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent className='p-1'>
            <p>Select reasoning effort</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-40 rounded-md">
          <div className="p-2">
            <div className="text-xs uppercase font-medium">Reasoning Effort</div>
          </div>

          {reasoningOptions.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className="flex items-center text-xs justify-between cursor-pointer"
            >
              <span>{option.label}</span>
              {value === option.value && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
};
