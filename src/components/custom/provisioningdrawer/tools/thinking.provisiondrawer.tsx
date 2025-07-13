import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline";
import { ThinkingStep } from "@/types/provision/chat";
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Check, ChevronDown } from "lucide-react";
import { useState } from "react";

export const ThinkingTimeline: React.FC<{
  steps: ThinkingStep[];
  currentStep: number;
  isCompleted?: boolean;
  isCollapsible?: boolean;
}> = ({ steps, currentStep, isCompleted = false, isCollapsible = false }) => {
  const [isExpanded, setIsExpanded] = useState(!isCompleted);

  if (isCollapsible && isCompleted) {
    return (
      <div className="mb-4 rounded-md">
        <div
          className="flex justify-between rounded-md items-center p-2 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Brain className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-medium text-blue-800 dark:text-blue-300">Reasoning</span>
            <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-200 dark:bg-blue-900/50 px-2 py-0.5 rounded-full">
              {steps.filter(s => s.completed).length}/{steps.length} completed
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-blue-600 dark:text-blue-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </div>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-3">
                <Timeline defaultValue={currentStep} orientation="vertical">
                  {steps.map((step) => (
                    <TimelineItem
                      key={step.id}
                      step={step.id}
                      className="group-data-[orientation=vertical]/timeline:ms-8 pb-2 last:pb-0"
                    >
                      <TimelineHeader>
                        <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem)] group-data-[orientation=vertical]/timeline:translate-y-4" />
                        <TimelineTitle className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {step.title}
                        </TimelineTitle>
                        <TimelineIndicator className={`
                          flex size-5 items-center justify-center border-2 group-data-[orientation=vertical]/timeline:-left-6
                          ${step.completed
                            ? 'bg-green-400 border-green-400 dark:bg-green-500 dark:border-green-500 text-green-700 dark:text-green-800'
                            : step.inProgress
                              ? 'bg-blue-500 border-blue-500 text-white animate-pulse'
                              : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                          }
                        `}>
                          {step.completed ? (
                            <step.icon size={12} />
                          ) : (
                            <step.icon size={12} />
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="mb-4 p-3  rounded-lg ">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-medium text-blue-800 dark:text-blue-300">Reasoning</span>
      </div>

      <Timeline defaultValue={currentStep} orientation="vertical">
        {steps.map((step) => (
          <TimelineItem
            key={step.id}
            step={step.id}
            className="group-data-[orientation=vertical]/timeline:ms-8 pb-2 last:pb-0"
          >
            <TimelineHeader>
              <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem)] group-data-[orientation=vertical]/timeline:translate-y-4" />
              <TimelineTitle className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {step.title}
              </TimelineTitle>
              <TimelineIndicator className={`
                flex size-5 items-center justify-center border-2 group-data-[orientation=vertical]/timeline:-left-6
                ${step.completed
                  ? 'bg-green-500 border-green-500 text-white'
                  : step.inProgress
                    ? 'bg-blue-500 border-blue-500 text-white animate-pulse'
                    : 'bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                }
              `}>
                {step.completed ? (
                  <Check size={12} />
                ) : (
                  <step.icon size={12} />
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
  );
};