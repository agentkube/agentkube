import React, { useState } from 'react';
import { Check, ClipboardCopy, CirclePlay, ExternalLink, Maximize2 } from 'lucide-react';
import { ExecutionResult } from '@/types/cluster';
import { ExecuteCommand } from '@/api/internal/execute';
import { useCluster } from '@/contexts/clusterContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Command {
  id: string;
  format: string;
  docString: string;
  example: string;
  readOnly: boolean;
  order: number;
}

const CommandBlock = ({ command }: { command: Command }) => {
  const { currentContext } = useCluster();
  const [copied, setCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command.format);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const parseKubectlCommand = (command: string): string[] => {
    const args = command
      .replace(/^kubectl\s+/, '')
      .match(/(?:[^\s"']+|['"][^'"]*["'])+/g) || [];

    return args.map(arg => arg.replace(/^['"]|['"]$/g, ''));
  };

  const handleExecute = async () => {
    if (!currentContext) {
      setError('No cluster selected. Please select a cluster first.');
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (!command.format.trim().startsWith('kubectl')) {
      setError('Only kubectl commands can be executed');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      setIsExecuting(true);
      setError(null);
      setResult(null);

      const args = parseKubectlCommand(command.format.trim());
      const result = await ExecuteCommand(args);
      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute command');
    } finally {
      setIsExecuting(false);
    }
  };

  const showExecuteButton = command.format.includes('kubectl');

  return (
    <>
      <div className="relative my-2 rounded-xl">
        <div className="flex justify-between p-2 border-b border-gray-300 bg-gray-300/80 rounded-t-xl">
          <div className="px-4 py-1 text-xs text-gray-900">
            Terminal
          </div>
          <div className="flex">
            {showExecuteButton && (
              <button
                onClick={handleExecute}
                disabled={isExecuting || !currentContext}
                className="px-2 py-1 flex items-center justify-center rounded-lg hover:bg-gray-400 text-gray-900 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title={!currentContext ? 'Please select a cluster first' : ''}
              >
                <CirclePlay className="mr-2" size={14} />
                {isExecuting ? "Running..." : "Run"}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="px-2 py-1 rounded-lg ml-2 hover:bg-gray-400 text-gray-900"
            >
              {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
            </button>
          </div>
        </div>
        <div className="bg-gray-100 rounded-b-xl px-4 py-3 overflow-x-auto border border-gray-300">
          <pre>
            <code>{command.format}</code>
          </pre>
        </div>

        {error && (
          <div className="p-4 border-t border-gray-300 bg-red-100 text-red-600 rounded-b-xl">
            {error}
          </div>
        )}

        {result && (
          <div className="px-4 pt-4 pb-2 border border-gray-600/50 bg-gray-300/60 text-gray-900 rounded-xl mt-2">
            <div className="flex justify-between items-center mb-2 border-b-2 border-gray-400/50">
              <div className="text-sm text-gray-600">Command output:</div>
              <div className="flex gap-2">

                <button
                  onClick={() => {/* Add your open in chat handler here */ }}
                  className="flex items-center p-2 text-xs rounded-xl hover:bg-gray-300/50 text-gray-600"
                >
                  <ExternalLink size={14} className="mr-1" />
                  Open in chat
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {result.output}
            </pre>
            <div className="flex justify-end relative left-2">
              <button
                onClick={() => setIsDialogOpen(true)}
                className="flex items-center p-2 text-xs rounded-xl bg-gray-300 hover:bg-gray-300/50 text-gray-600"
              >
                <Maximize2 size={14} className="mr-1" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] bg-gray-200">
          <DialogHeader>
            <DialogTitle>Command Output</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto">
            <pre className="whitespace-pre-wrap font-mono text-sm p-4 bg-gray-300/80 text-gray-900 rounded-xl border border-gray-900">
              {result?.output}
            </pre>
          </div>
          <div className="flex justify-end relative left-2">
            <button
              onClick={() => {/* Add your open in chat handler here */ }}
              className="flex items-center py-2 px-4 text-md rounded-xl bg-gray-300 hover:bg-gray-400 text-gray-900"
            >
              <ExternalLink size={14} className="mr-1" />
              Open in chat
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CommandBlock;