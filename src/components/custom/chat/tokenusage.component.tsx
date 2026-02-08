import React from 'react';
import { Coins } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TokenUsageProps {
  inputTokens: number;
  outputTokens: number;
  maxTokens?: number; // Model's context window size
  className?: string;
}

/**
 * TokenUsage component - OpenCode-style token display.
 * Shows a compact token count that expands to show input/output breakdown.
 * 
 * Based on SST/OpenCode's sidebar display pattern:
 * - Tracks tokens per session/conversation
 * - Shows usage percentage relative to model's context window
 */
const TokenUsage: React.FC<TokenUsageProps> = ({
  inputTokens = 0,
  outputTokens = 0,
  maxTokens = 128000, // Default to GPT-4o context window
  className = ''
}) => {
  const totalTokens = inputTokens + outputTokens;

  // Calculate usage percentage
  const usagePercent = Math.round((totalTokens / maxTokens) * 100);

  // Format token count (e.g., 15104 -> "15.1K" for large numbers)
  const formatTokens = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  // Get color based on usage percentage
  const getUsageColor = (percent: number): string => {
    if (percent >= 80) return 'text-red-400';
    if (percent >= 60) return 'text-orange-400';
    return 'text-muted-foreground';
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground 
            hover:text-foreground hover:bg-accent-hover/40 rounded-md transition-colors ${className}`}
        >
          <Coins className="h-3.5 w-3.5" />
          {/* <span>{formatTokens(totalTokens)}</span> */}
          <span className={getUsageColor(usagePercent)}>{usagePercent}%</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3 bg-popover/95 backdrop-blur-md border border-border shadow-lg"
        side="top"
        align="center"
      >
        <div className="flex flex-col gap-2 text-sm">
          {/* Total Tokens */}
          <div className="flex justify-between items-center gap-6">
            <span className="text-muted-foreground">Tokens</span>
            <span className="font-mono font-medium text-foreground">
              {totalTokens.toLocaleString()}
            </span>
          </div>

          {/* Input Tokens */}
          {/* <div className="flex justify-between items-center gap-6">
            <span className="text-muted-foreground">Input</span>
            <span className="font-mono text-muted-foreground">
              {inputTokens.toLocaleString()}
            </span>
          </div> */}

          {/* Output Tokens */}
          {/* <div className="flex justify-between items-center gap-6">
            <span className="text-muted-foreground">Output</span>
            <span className="font-mono text-muted-foreground">
              {outputTokens.toLocaleString()}
            </span>
          </div> */}

          {/* Usage */}
          <div className="flex justify-between items-center gap-6">
            <span className="text-muted-foreground">Usage</span>
            <span className={`font-mono font-medium ${getUsageColor(usagePercent)}`}>
              {usagePercent}%
            </span>
          </div>

          {/* Max Tokens info */}
          <div className="pt-1 border-t border-border text-xs text-muted-foreground">
            <span>Context: {formatTokens(maxTokens)} tokens</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default TokenUsage;
