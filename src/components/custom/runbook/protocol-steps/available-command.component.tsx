import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type { Command } from '@/types/protocols';

interface AvailableCommandsProps {
  commands: Command[];
  onAddCommand: () => void;
  onUpdateCommand: (commandIndex: number, updatedCommand: Command) => void;
}

const AvailableCommands: React.FC<AvailableCommandsProps> = ({
  commands,
  onAddCommand,
  onUpdateCommand,
}) => {
  const handleCommandChange = (
    commandIndex: number,
    field: keyof Command,
    value: string | boolean
  ) => {
    const updatedCommand = {
      ...commands[commandIndex],
      [field]: value,
      order: commands[commandIndex].order // Preserve existing order
    };
    onUpdateCommand(commandIndex, updatedCommand);
  };

  return (
    <div className="mt-6">
      <h4 className="font-medium mb-2">Available Commands</h4>
      {commands.map((command, commandIndex) => (
        <div key={commandIndex} className="mb-4 space-y-2">
          <Input
            placeholder="Command Format"
            value={command.format}
            className="bg-gray-50 border border-gray-400/40 rounded-xl"
            onChange={(e) => handleCommandChange(commandIndex, 'format', e.target.value)}
          />
          <Input
            placeholder="Doc String"
            value={command.docString}
            className="bg-gray-50 border border-gray-400/40 rounded-xl"
            onChange={(e) => handleCommandChange(commandIndex, 'docString', e.target.value)}
          />
          <Input
            placeholder="Example"
            value={command.example}
            className="bg-gray-50 border border-gray-400/40 rounded-xl"
            onChange={(e) => handleCommandChange(commandIndex, 'example', e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              checked={command.readOnly}
              onCheckedChange={(checked) => 
                handleCommandChange(commandIndex, 'readOnly', !!checked)
              }
            />
            <span className="text-sm">Read Only</span>
          </div>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={onAddCommand}
        className="mt-2"
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Available Command
      </Button>
    </div>
  );
};

export default AvailableCommands;