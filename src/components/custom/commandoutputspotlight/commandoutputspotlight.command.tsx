import React, { useState, useEffect } from 'react';
import { Copy, Maximize2, Play, Check } from 'lucide-react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExecutionResult } from "@/types/cluster";
import { ExecuteCommand } from '@/api/internal/execute';
import { useCluster } from '@/contexts/clusterContext';
import { formatTableOutput } from '@/utils/output-format.utils';

interface CommandOutputSpotlightProps {
  output: ExecutionResult;
  isExecuting: boolean;
  isDialogOpen?: boolean;
  setIsDialogOpen?: (open: boolean) => void;
}

const CommandOutputSpotlight: React.FC<CommandOutputSpotlightProps> = ({
  output,
  isExecuting: initialIsExecuting,
  isDialogOpen: externalDialogOpen,
  setIsDialogOpen: setExternalDialogOpen
}) => {
  const [internalDialogOpen, setInternalDialogOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(initialIsExecuting);
  const [currentOutput, setCurrentOutput] = useState(output);
  const [isCopied, setIsCopied] = useState(false);
  const { currentContext } = useCluster();

  const isDialogOpen = externalDialogOpen !== undefined ? externalDialogOpen : internalDialogOpen;
  const setIsDialogOpen = setExternalDialogOpen || setInternalDialogOpen;

  // Helper function to clean kubectl command path
  const cleanKubectlCommand = (command: string): string => {
    // Replace any path ending with /kubectl with just kubectl
    return command.replace(/.*\/kubectl(\s|$)/g, 'kubectl$1');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentOutput.output);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  useEffect(() => {
    setCurrentOutput({
      ...output,
      command: cleanKubectlCommand(output.command)
    });
    setIsExecuting(initialIsExecuting);
  }, [output, initialIsExecuting]);

  const handleRerun = async () => {
    setIsExecuting(true);

    if (!currentContext) return;

    try {
      const result = await ExecuteCommand(
        currentOutput.command,
        currentContext.name
      );
      setCurrentOutput({
        ...result,
        command: cleanKubectlCommand(result.command)
      });
    } catch (error) {
      console.error('Failed to execute command:', error);
      setCurrentOutput({
        command: cleanKubectlCommand(currentOutput.command),
        output: 'Failed to execute command: ' + (error as Error).message,
        success: false
      });
    } finally {
      setIsExecuting(false);
    }
  };
  
  return (
    <>
      <div className="px-4 py-2">
        <div className="bg-muted/50 rounded-[0.4rem] border border-border relative">
          <div className='flex justify-between'>
            <h2 className="bg-muted text-sm rounded-tl-[0.4rem] w-fit py-1 px-4 text-muted-foreground">bash</h2>
            <div className='p-1 space-x-2'>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-accent rounded transition-colors"
              >
                {isCopied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {!isExecuting && currentOutput.output.length > 0 && (
                <button
                  onClick={() => setIsDialogOpen(true)}
                  className="p-1 hover:bg-accent rounded transition-colors"
                >
                  <Maximize2 className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
          <div className="p-2 max-h-60 overflow-y-auto py-1

            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-border
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-border/70">
            {isExecuting ? (
              <p className="text-muted-foreground">Executing command...</p>
            ) : (
              <div className="text-sm py-2 font-mono whitespace-pre">
                {formatTableOutput(currentOutput.output)}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex flex-col items-center max-w-5xl max-h-[80vh] bg-background backdrop-blur-sm">
          <div className="p-4 max-w-4xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-foreground font-semibold">Command Output</h3>
              <Button
                onClick={handleRerun}
                disabled={isExecuting}
                className="flex items-center gap-2 border border-border rounded-[0.4rem]"
                variant="outline"
              >
                <Play className="w-4 h-4" />
                {isExecuting ? 'Running...' : 'Run Again'}
              </Button>
            </div>
            <div className="bg-muted/50 p-4 rounded-[0.4rem] border border-border">
              <code className="text-sm font-mono">{currentOutput.command}</code>
            </div>
            <div className="mt-4 bg-muted/50 rounded-[0.4rem] max-h-[60vh] overflow-auto">
              <h2 className="bg-muted text-muted-foreground text-sm rounded-tl-[0.4rem] w-fit py-1 px-4 sticky top-0 z-10">bash</h2>
              <div className="whitespace-pre p-2 text-sm border-t border-border font-mono overflow-x-auto min-w-0">
                {isExecuting ? (
                  <div className="text-muted-foreground">Executing command...</div>
                ) : (
                  formatTableOutput(currentOutput.output)
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CommandOutputSpotlight;