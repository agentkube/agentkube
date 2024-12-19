import { OpenAIModel } from '../services/openai/openai.services';
import { investigationPrompt } from '../internal/prompt';
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CommandResult } from "../types/investigation.types";

export interface InvestigationSummary {
  description: string;
  summary: string;
}

/**
 * Analyzes kubectl commands and their outputs to generate an investigation summary
 * @param commands Array of command and output pairs to analyze
 * @returns Investigation summary result with description and summary
 */
export const generateInvestigationSummary = async (
  commands: CommandResult[]
): Promise<InvestigationSummary> => {

  if (!commands || !Array.isArray(commands)) {
    return {
      description: "Invalid input",
      summary: "Commands array is required"
    };
  }

  try {
    // Format the commands and outputs for the prompt
    const commandHistory = commands
      .map(cmd => `Command: ${cmd.command}\nOutput:\n${cmd.output}`)
      .join("\n\n");

    const result = await OpenAIModel.invoke([
      new SystemMessage(investigationPrompt),
      new HumanMessage(`Analyze these kubectl commands and their outputs:\n\n${commandHistory}`)
    ]);

    // Parse the response as JSON
    const parsedResponse = JSON.parse(result.content as string);
    
    return {
      description: parsedResponse.description,
      summary: parsedResponse.summary
    };

  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        description: "Failed to parse investigation summary",
        summary: "Error analyzing command outputs"
      };
    }
    
    return {
      description: "Error in investigation summary",
      summary: error instanceof Error ? error.message : "Unknown error"
    };
  }
};