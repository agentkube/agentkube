// api/internal/exectute.ts
import { ExecutionResult } from "@/types/cluster";

export const ExecuteCommand = async (args: string): Promise<ExecutionResult> => {

  const response = await fetch(`http://localhost:4688/api/v1/api/execute`, {
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
