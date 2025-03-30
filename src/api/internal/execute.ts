// api/internal/exectute.ts
import { ORCHESTRATOR_URL } from "@/config";
import { ExecutionResult } from "@/types/cluster";

export const ExecuteCommand = async (args: string): Promise<ExecutionResult> => {

  const response = await fetch(`${ORCHESTRATOR_URL}/api/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      command: args
    })
  });
  
  if (!response.ok) {
    throw new Error("failed to execute the command");
  }
  
  return response.json();
};
