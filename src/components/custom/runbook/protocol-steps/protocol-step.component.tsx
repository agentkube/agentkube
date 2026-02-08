import React from 'react';
import { Minus, Play } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ConditionalStep from './conditional-step.component';
import AvailableCommands from './available-command.component';
import { Input } from "@/components/ui/input";
import type { Command, NextStep, ProtocolStep as Step } from '@/types/protocols';

interface ProtocolStepProps {
  step: Step;
  stepIndex: number;
  showConnector: boolean;
  onRemoveStep: (stepIndex: number) => void;
  onUpdateStepDetails: (stepIndex: number, details: string) => void;
  onUpdateTitle: (stepIndex: number, title: string) => void;
  onAddCommand: (stepIndex: number) => void;
  onUpdateCommand: (stepIndex: number, commandIndex: number, updatedCommand: Command) => void;
  onAddNextStep: (stepIndex: number) => void;
  onRemoveNextStep: (stepIndex: number, nextStepIndex: number) => void;
  onNextStepChange: (stepIndex: number, nextStepIndex: number, updatedNextStep: NextStep) => void;
  availableSteps: { number: number; title: string }[];
}

const ProtocolStep: React.FC<ProtocolStepProps> = ({
  step,
  stepIndex,
  showConnector,
  availableSteps,
  onRemoveStep,
  onUpdateStepDetails,
  onUpdateTitle,
  onAddCommand,
  onUpdateCommand,
  onAddNextStep,
  onRemoveNextStep,
  onNextStepChange,
}) => {
  // Handler to ensure command updates include the order
  const handleCommandUpdate = (commandIndex: number, updatedCommand: Partial<Command>) => {
    const commandWithOrder = {
      ...updatedCommand,
      order: step.commands[commandIndex]?.order ?? commandIndex,
    } as Command;
    onUpdateCommand(stepIndex, commandIndex, commandWithOrder);
  };

  // Handler to ensure nextStep updates include required fields
  const handleNextStepUpdate = (nextStepIndex: number, updatedNextStep: Partial<NextStep>) => {
    const nextStepWithRequiredFields = {
      ...updatedNextStep,
      order: step.nextSteps[nextStepIndex]?.order ?? nextStepIndex,
      referenceType: updatedNextStep.referenceType || 'FINAL',
    } as NextStep;
    onNextStepChange(stepIndex, nextStepIndex, nextStepWithRequiredFields);
  };

  return (
    <div className="relative">
      {showConnector && (
        <div className="absolute -top-8 left-10 w-0.5 h-8 bg-blue-400" />
      )}

      <div className="bg-gray-50 rounded-3xl shadow-sm border p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
            <Play className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-lg font-medium">Step {step.number}</h3>
          <div className="flex items-center gap-4 w-[30rem]">
            <Input
              className="border border-gray-400/70 rounded-xl text-base"
              placeholder="Step Title"
              value={step.title}
              onChange={(e) => onUpdateTitle(stepIndex, e.target.value)}
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => onRemoveStep(stepIndex)}
          >
            <Minus className="w-4 h-4" />
            Remove Step
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h4 className="font-medium mb-2">Instructions</h4>
            <Textarea
              placeholder="Step Details"
              className="resize-none border border-gray-400/40 rounded-xl"
              value={step.details}
              onChange={(e) => onUpdateStepDetails(stepIndex, e.target.value)}
            />
            <AvailableCommands
              commands={step.commands}
              onAddCommand={() => onAddCommand(stepIndex)}
              onUpdateCommand={handleCommandUpdate}
            />
          </div>

          <div>
            <ConditionalStep
              nextSteps={step.nextSteps}
              availableSteps={availableSteps}
              currentStepNumber={step.number}
              onAddNextStep={() => onAddNextStep(stepIndex)}
              onRemoveNextStep={(nextStepIndex) => onRemoveNextStep(stepIndex, nextStepIndex)}
              onNextStepChange={handleNextStepUpdate}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtocolStep;