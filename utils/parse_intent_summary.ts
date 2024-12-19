// utils/parse-summary.ts
import { OpenAIModel } from "../services/openai/openai.services";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StepResult } from "../types/investigation.types";

interface ParseSummaryRequest {
  summaries: StepResult[];
  message?: string;
  accessType?: "READ_ONLY" | "READ_WRITE";
  shouldRepeatCommand?: boolean;
}

interface ParsedCommand {
  command: string;
  description: string;
  shouldRepeat?: boolean;
  repeatInterval?: number; // in seconds
}

export const parseSummary = async (req: ParseSummaryRequest): Promise<ParsedCommand> => {
  const { 
    summaries, 
    message = "", 
    accessType = "READ_ONLY",
    shouldRepeatCommand = false
  } = req;

  // Get the most recent command if it exists
  const lastStep = summaries[summaries.length - 1];
  const lastCommand = lastStep?.commands[lastStep.commands.length - 1];

  // Format summaries for better readability
  const formattedSummaries = summaries.map(s => ({
    step: s.stepNumber,
    description: s.description,
    summary: s.summary,
    lastCommand: s.commands[s.commands.length - 1]?.command
  }));

  const systemPrompt = `As a Kubernetes expert, analyze these investigation summaries and suggest the next command.
Previous findings: ${JSON.stringify(formattedSummaries, null, 2)}

Rules:
1. For READ_ONLY access type (current: ${accessType}), only use get, describe, logs commands
2. For READ_WRITE access type, all commands are allowed
3. Focus on: pending resources, errors, misconfigurations, performance
4. If monitoring is needed, suggest repeating the same command
5. Return ONLY a valid JSON object with these fields:
   - command: string with kubectl command
   - description: string explaining why this command is needed
   - shouldRepeat: boolean indicating if command should be repeated
   - repeatInterval: number of seconds between repetitions (if shouldRepeat is true)

Example response format for one-time command:
{"command": "kubectl describe pod nginx-pod", "description": "Investigating pod status", "shouldRepeat": false}

Example response format for repeated command:
{"command": "kubectl get pods -w", "description": "Monitoring pod status changes", "shouldRepeat": true, "repeatInterval": 30}

IMPORTANT: 
- Response must be valid JSON
- No markdown or code blocks
- Keep description concise
${shouldRepeatCommand ? '- Reuse the last command: ' + (lastCommand?.command || 'No previous command') : ''}`;

  try {
    const result = await OpenAIModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(message || "Based on the above findings, what should we investigate next?")
    ]);

    try {
      // Additional safety check for JSON format
      const content = result.content as string;
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanContent);

      // Validate response structure
      if (!parsed.command || !parsed.description) {
        throw new Error("Invalid response format");
      }

      // If we should repeat the command and have a previous command, use it
      if (shouldRepeatCommand && lastCommand) {
        return {
          command: lastCommand.command,
          description: parsed.description || `Repeating command: ${lastCommand.command}`,
          shouldRepeat: true,
          repeatInterval: parsed.repeatInterval || 30 // Default to 30 seconds if not specified
        };
      }

      return {
        command: parsed.command,
        description: parsed.description,
        shouldRepeat: parsed.shouldRepeat || false,
        repeatInterval: parsed.repeatInterval
      };
    } catch (parseError) {
      console.error("JSON parsing error:", parseError);
      // If we should repeat and have a last command, return it despite parsing error
      if (shouldRepeatCommand && lastCommand) {
        return {
          command: lastCommand.command,
          description: `Continuing to monitor: ${lastCommand.command}`,
          shouldRepeat: true,
          repeatInterval: 30
        };
      }
      return {
        command: "",
        description: "Failed to parse AI response into valid command format",
        shouldRepeat: false
      };
    }
  } catch (error) {
    console.error("Error invoking OpenAI:", error);
    // Even if OpenAI fails, we can still repeat the last command if needed
    if (shouldRepeatCommand && lastCommand) {
      return {
        command: lastCommand.command,
        description: `Continuing to monitor: ${lastCommand.command}`,
        shouldRepeat: true,
        repeatInterval: 30
      };
    }
    return {
      command: "",
      description: "Failed to generate next investigation step",
      shouldRepeat: false
    };
  }
};