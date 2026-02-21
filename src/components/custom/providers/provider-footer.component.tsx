import React, { useState } from 'react';
import { Cpu, Plus } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import ProviderDialog, { type Provider } from './provider-dialog.component';

const ProviderFooter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState<Provider | null>(null);

  const handleSelectProvider = (provider: Provider, _apiKey: string) => {
    setActiveProvider(provider);
    setOpen(false);
  };

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              id="provider-footer-btn"
              onClick={() => setOpen(true)}
              className="flex items-center gap-1.5 backdrop-blur-md px-2 py-1 text-xs hover:bg-accent-hover hover:text-foreground transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3 shrink-0" />
              <span className="max-w-[100px] truncate">
                {activeProvider ? activeProvider.name : 'Connect provider'}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent className="bg-card text-foreground border-border">
            <p>{activeProvider ? `Provider: ${activeProvider.name}` : 'Connect an AI provider'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <ProviderDialog
        open={open}
        onOpenChange={setOpen}
        onSelectProvider={handleSelectProvider}
      />
    </>
  );
};

export default ProviderFooter;
