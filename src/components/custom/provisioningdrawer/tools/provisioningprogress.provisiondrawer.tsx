import { Button } from "@/components/ui/button";
import { ProvisioningState } from "@/types/provision/chat";
import { Pause, Play, RotateCcw, Layers, X, Check, Settings, Cloud } from "lucide-react";
import { useState } from "react";
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";

export const ProvisioningProgress: React.FC<{
  provisioningState: ProvisioningState;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
  onReRun: () => void;
}> = ({ provisioningState, onClose, onPause, onResume, onReRun }) => {
  const [selectedTab, setSelectedTab] = useState<'steps' | 'logs'>('steps');

  if (!provisioningState.isProvisioning) return null;

  return (
    <div className="mb-4 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-100 dark:bg-gray-950/20">
      <div className="flex items-center justify-between p-2 border-b border-gray-200 dark:border-gray-800/30">
        <div className="flex items-center gap-2">
          <Layers className="h-3 w-4" />
          <span className="text-xs font-medium">
            Provisioning Infrastructure
          </span>
          {provisioningState.isPaused ? (
            <span className="text-xs text-orange-600 dark:text-orange-400 bg-orange-200 dark:bg-orange-900/50 px-2 py-0.5 rounded-full">
              Paused
            </span>
          ) : provisioningState.isCompleted ? (
            <span className="text-xs text-green-600 dark:text-green-400 bg-green-200 dark:bg-green-900/50 px-2 py-0.5 rounded-full">
              Completed
            </span>
          ) : (
            <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-200 dark:bg-blue-900/50 px-2 py-0.5 rounded-full">
              Step {provisioningState.currentStep}/{provisioningState.steps.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {provisioningState.isCompleted ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReRun}
              className="p-1 h-6 w-6"
              title="Re-run provisioning"
            >
              <RotateCcw className="h-3 w-3 dark:text-gray-500" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={provisioningState.isPaused ? onResume : onPause}
              className="p-1 h-6 w-6"
              title={provisioningState.isPaused ? "Resume provisioning" : "Pause provisioning"}
            >
              {provisioningState.isPaused ? (
                <Play className="h-3 w-3 dark:text-gray-500" />
              ) : (
                <Pause className="h-3 w-3 dark:text-gray-500" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1 h-6 w-6"
            title="Close provisioning"
          >
            <X className="h-3 w-3 dark:text-gray-500" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setSelectedTab('steps')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${selectedTab === 'steps'
            ? 'text-gray-700 dark:text-gray-300 border-b-2 border-gray-600 dark:border-gray-400'
            : 'text-gray-600 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
        >
          Steps
        </button>
        <button
          onClick={() => setSelectedTab('logs')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${selectedTab === 'logs'
            ? 'text-gray-700 dark:text-gray-300 border-b-2 border-gray-600 dark:border-gray-400'
            : 'text-gray-600 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
        >
          Logs
        </button>
      </div>

      <div>
        {selectedTab === 'steps' ? (
          <div className='p-3'>
            <Timeline defaultValue={provisioningState.currentStep} orientation="vertical">
              {provisioningState.steps.map((step) => (
                <TimelineItem
                  key={step.id}
                  step={step.id}
                  className="group-data-[orientation=vertical]/timeline:ms-8 pb-2 last:pb-0"
                >
                  <TimelineHeader>
                    <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem)] group-data-[orientation=vertical]/timeline:translate-y-4" />
                    <TimelineTitle className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {step.title}
                      {step.duration && (step.status === 'completed' || step.status === 'terminated') && (
                        <span className="ml-2 text-xs text-gray-500">({step.duration}s)</span>
                      )}
                      {step.status === 'terminated' && (
                        <span className="ml-2 text-xs text-red-600 dark:text-red-400">Terminated</span>
                      )}
                    </TimelineTitle>
                    <TimelineIndicator className={`
                      flex size-5 items-center justify-center border-2 group-data-[orientation=vertical]/timeline:-left-6
                      ${step.status === 'completed'
                        ? 'bg-green-500 border-green-500 text-green-800'
                        : step.status === 'in-progress'
                          ? 'bg-blue-500 border-blue-500 text-white animate-pulse'
                          : step.status === 'error'
                            ? 'bg-red-500 border-red-500 text-white'
                            : step.status === 'terminated'
                              ? 'bg-red-500 border-red-500 text-white'
                              : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                      }
                    `}>
                      {step.status === 'completed' ? (
                        <Check size={12} />
                      ) : step.status === 'error' || step.status === 'terminated' ? (
                        <X size={12} />
                      ) : step.status === 'in-progress' ? (
                        <Settings size={12} className="animate-spin" />
                      ) : (
                        <Cloud size={12} />
                      )}
                    </TimelineIndicator>
                  </TimelineHeader>
                  <TimelineContent>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0">
                      {step.description}
                    </p>
                  </TimelineContent>
                </TimelineItem>
              ))}
            </Timeline>
          </div>
        ) : (
          <div className='bg-black dark:bg-neutral-900 p-2'>
            <div className="space-y-0.5 max-h-40 overflow-y-auto
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
            ">
              {provisioningState.logs.map((log, index) => (
                <div key={index} className="text-xs font-mono text-gray-700 dark:text-gray-300 p-1 rounded">
                  {log}
                </div>
              ))}
              {provisioningState.logs.length === 0 && (
                <p className="text-xs text-gray-500 italic">No logs available yet...</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};