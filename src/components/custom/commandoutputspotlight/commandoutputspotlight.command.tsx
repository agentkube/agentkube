import React, { useState } from 'react';
import { Maximize2, Play } from 'lucide-react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExecutionResult } from "@/types/cluster";
import { ExecuteCommand } from '@/api/internal/execute';
import { useCluster } from '@/contexts/clusterContext';

interface CommandOutputSpotlightProps {
  output: ExecutionResult;
  isExecuting: boolean;
}

const CommandOutputSpotlight: React.FC<CommandOutputSpotlightProps> = ({
  output,
  isExecuting: initialIsExecuting
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isExecuting, setIsExecuting] = useState(initialIsExecuting);
  const [currentOutput, setCurrentOutput] = useState(output);
  const { currentContext } = useCluster();

  const handleRerun = async () => {
    setIsExecuting(true);

    if (!currentContext) return;

    try {
      // const args = currentOutput.command.replace(/^kubectl\s+/, '').split(' ');
      const result = await ExecuteCommand(
        currentOutput.command,
        currentContext.name
      );
      setCurrentOutput(result);
    } catch (error) {
      console.error('Failed to execute command:', error);
      setCurrentOutput({
        command: currentOutput.command,
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
        <div className="bg-gray-200 dark:bg-gray-900/80 rounded-[0.4rem] border border-gray-400/80 dark:border-gray-800/80 relative">
          <h2 className="bg-gray-300 dark:bg-gray-800 text-sm rounded-tl-[0.4rem] w-fit py-1 px-4 text-gray-600 dark:text-gray-400">bash</h2>
          <div className="p-2 max-h-60 overflow-y-auto  overflow-y-auto py-1 
            scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
            {isExecuting ? (
              <p className="text-gray-600">Executing command...</p>
            ) : (
              <pre className="whitespace-pre-wrap text-sm font-mono ">
                {currentOutput.output}
              </pre>
            )}
          </div>
          {!isExecuting && currentOutput.output.length > 0 && (
            <button
              onClick={() => setIsDialogOpen(true)}
              className="absolute top-2 right-2 p-1 hover:bg-gray-300 dark:hover:bg-gray-800 rounded transition-colors"
            >
              <Maximize2 className="w-4 h-4 text-gray-600" />
            </button>
          )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] bg-gray-100 dark:bg-[#0B0D13]/20 backdrop-blur-sm">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-600 font-semibold">Command Output</h3>
              <Button
                onClick={handleRerun}
                disabled={isExecuting}
                className="flex items-center gap-2 border border-gray-400 rounded-[0.4rem]"
                variant="outline"
              >
                <Play className="w-4 h-4" />
                {isExecuting ? 'Running...' : 'Run Again'}
              </Button>
            </div>
            <div className="bg-gray-100 dark:bg-[#0B0D13]/20 p-4 rounded-[0.4rem] border border-gray-400 dark:border-gray-800">
              <code className="text-sm font-mono">{currentOutput.command}</code>
            </div>
            <div className="mt-4 bg-gray-100 dark:bg-gray-900/80 rounded-[0.4rem] max-h-[60vh] overflow-y-auto">
              <h2 className="bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm rounded-tl-[0.4rem] w-fit  py-1 px-4">bash</h2>
              <pre className="whitespace-pre-wrap p-2 text-sm font-mono border-t border-gray-300 dark:border-gray-800">
                {isExecuting ? 'Executing command...' : currentOutput.output}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CommandOutputSpotlight;