import React from 'react';
import { Play, ChevronRight, Split } from 'lucide-react';
import CommandBlock from './protocol-code-block.component';

interface Command {
  id: string;
  format: string;
  docString: string;
  example: string;
  readOnly: boolean;
  order: number;
}

interface NextStep {
  id: string;
  referenceType: 'STEP' | 'FINAL' | 'STOP';
  targetStepNumber: number | null;
  conditions: string[];
  isUnconditional: boolean;
  order: number;
}

interface ResponseProtocolStepProps {
  id: string;
  number: number;
  title: string;
  details: string;
  commands: Command[];
  nextSteps: NextStep[];
  isLast?: boolean;
}

const ResponseProtocolStep: React.FC<ResponseProtocolStepProps> = ({
  number,
  title,
  details,
  commands,
  nextSteps,
  isLast
}) => {
  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-4 top-16 bottom-0 w-0.5 bg-blue-100" />
      )}
      
      <div className="relative flex gap-4">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
            <Play className="w-4 h-4 text-blue-600" />
          </div>
        </div>

        <div className="flex-grow">
          <h3 className="text-lg font-medium mb-6">
            Step {number} {title}
          </h3>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-6">
              {/* Details Section */}
              <div>
                <h4 className="text-sm font-medium mb-2">Details</h4>
                <p className="text-gray-600 border border-gray-500 p-2 rounded-xl">
                  {details}
                </p>
              </div>

              {/* Available Commands Section */}
              <div>
                <h4 className="text-sm font-medium mb-2">Available Commands</h4>
                <div className="space-y-2">
                  {commands.map((command) => (
                    <CommandBlock key={command.id} command={command} />
                  ))}
                </div>
              </div>
            </div>

            {/* Next Steps Section */}
            <div className="rounded-xl border border-gray-400 p-4">
              <h4 className="text-sm font-medium mb-4">Next Steps</h4>
              <div className="space-y-4">
                {nextSteps.map((step) => (
                  <div key={step.id}>
                    <div className="flex items-center gap-2 text-sm">
                      {step.referenceType === 'STEP' ? (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-400" />
                      )}
                      <span className="font-medium">
                        {step.referenceType === 'STEP' 
                          ? `Step ${step.targetStepNumber}`
                          : step.referenceType.charAt(0) + step.referenceType.slice(1).toLowerCase()}
                      </span>
                    </div>
                    {step.conditions.map((condition, idx) => (
                      <div key={idx} className="ml-6 mt-1">
                        <div className="bg-gray-100 flex items-center gap-2 py-1 px-2 border border-gray-300 rounded-xl">
                          <Split className='w-4 h-4 text-gray-500' />
                          <span className="text-sm text-gray-600">{condition}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResponseProtocolStep;