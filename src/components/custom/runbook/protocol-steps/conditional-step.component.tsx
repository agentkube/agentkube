import React from 'react';
import { Minus, Plus, Split } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NextStep } from '@/types/protocols';

interface ConditionalStepProps {
  nextSteps: NextStep[];
  availableSteps: { number: number; title: string }[];
  currentStepNumber: number;
  onAddNextStep: () => void;
  onRemoveNextStep: (nextStepIndex: number) => void;
  onNextStepChange: (nextStepIndex: number, updatedNextStep: NextStep) => void;
}

const ConditionalStep: React.FC<ConditionalStepProps> = ({
  nextSteps,
  availableSteps,
  currentStepNumber,
  onAddNextStep,
  onRemoveNextStep,
  onNextStepChange,
}) => {
  const handleConditionChange = (nextStepIndex: number, conditionIndex: number, value: string) => {
    const updatedNextStep = { ...nextSteps[nextStepIndex] };
    updatedNextStep.conditions[conditionIndex] = value;
    onNextStepChange(nextStepIndex, updatedNextStep);
  };

  const handleTypeChange = (nextStepIndex: number, value: string) => {
    const updatedNextStep = { ...nextSteps[nextStepIndex] };
    
    if (value === 'FINAL' || value === 'STOP') {
      updatedNextStep.referenceType = value;
      updatedNextStep.targetStepNumber = undefined;
    } else {
      const stepNumber = parseInt(value);
      updatedNextStep.referenceType = 'STEP';
      updatedNextStep.targetStepNumber = stepNumber;
    }
    
    onNextStepChange(nextStepIndex, updatedNextStep);
  };

  const handleUnconditionalChange = (nextStepIndex: number, checked: boolean) => {
    const updatedNextStep = { ...nextSteps[nextStepIndex], isUnconditional: checked };
    onNextStepChange(nextStepIndex, updatedNextStep);
  };

  const getStepTypeValue = (nextStep: NextStep): string => {
    if (nextStep.referenceType === 'FINAL' || nextStep.referenceType === 'STOP') {
      return nextStep.referenceType;
    }
    // For STEP type, return the target step number as string
    return nextStep.targetStepNumber?.toString() || '';
  };

  // Get display text for the current selection
  const getStepDisplayText = (nextStep: NextStep): string => {
    if (nextStep.referenceType === 'FINAL') return 'Final';
    if (nextStep.referenceType === 'STOP') return 'Stop';
    if (nextStep.referenceType === 'STEP' && nextStep.targetStepNumber) {
      const targetStep = availableSteps.find(step => step.number === nextStep.targetStepNumber);
      return targetStep?.title || `Step ${nextStep.targetStepNumber}`;
    }
    return 'Select next step';
  };

  // Filter out current step from available steps
  const filteredAvailableSteps = availableSteps.filter(
    step => step.number !== currentStepNumber
  );

  return (
    <div>
      <h4 className="font-medium mb-2">Next Steps</h4>
      {nextSteps.map((nextStep, nextStepIndex) => (
        <div key={nextStepIndex} className="mb-4 space-y-2 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Select
                value={getStepTypeValue(nextStep)}
                onValueChange={(value) => handleTypeChange(nextStepIndex, value)}
              >
                <SelectTrigger className="border border-gray-500 rounded-xl">
                  <SelectValue>
                    {getStepDisplayText(nextStep)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {filteredAvailableSteps.map((step) => (
                    <SelectItem 
                      key={`step-${step.number}`} 
                      value={step.number.toString()}
                    >
                      {step.title}
                    </SelectItem>
                  ))}
                  <SelectItem value="FINAL">Final</SelectItem>
                  <SelectItem value="STOP">Stop</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const updatedNextStep = { ...nextStep };
                  updatedNextStep.conditions.push('');
                  onNextStepChange(nextStepIndex, updatedNextStep);
                }}
              >
                <Plus className="w-4 h-4" />
                Add Condition
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-500 hover:text-red-600"
              onClick={() => onRemoveNextStep(nextStepIndex)}
            >
              <Minus className="w-4 h-4" />
              Remove
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={nextStep.isUnconditional}
              onCheckedChange={(checked) => handleUnconditionalChange(nextStepIndex, !!checked)}
            />
            <span className="text-sm">Is Unconditional (will remove other transitions)</span>
          </div>
          {nextStep.conditions.map((condition, conditionIndex) => (
            <div key={conditionIndex} className="relative flex items-center bg-white">
              <Split className="absolute left-3 w-4 h-4 text-gray-500" />
              <Input
                placeholder="Condition"
                value={condition}
                className="bg-white pl-10 pr-3 rounded-xl"
                onChange={(e) => handleConditionChange(nextStepIndex, conditionIndex, e.target.value)}
              />
            </div>
          ))}
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={onAddNextStep}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Next Step
      </Button>
    </div>
  );
};

export default ConditionalStep;