// queues/smart-investigation.queue.ts
import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { prisma } from "../connectors/prisma";
import redis from "../connectors/redis";
import { OpenAIModel } from "../services/openai/openai.services";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { CommandResult, StepResult } from '../types/investigation.types';

interface SmartInvestigationJobData {
  investigationId: string;
  clusterId: string;
  message: string;
  results: {
    steps: StepResult[];
  };
}

// Create queue instance
export const smartInvestigationQueue = new Queue<SmartInvestigationJobData>(
  "smart-investigation-queue",
  {
    connection: redis.options,
    defaultJobOptions: {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: {
        age: 24 * 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 7 * 24 * 3600,
      },
    },
  }
);

// Utility function to execute kubectl commands
async function executeClusterCommand(command: string[], endpoint: string): Promise<CommandResult> {
  const fullCommand = command.join(" ");

  try {
    const response = await fetch(`${endpoint}/api/v1/kubectl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ command: command.slice(1) }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as CommandResult;
    return {
      command: fullCommand,
      output: data.output,
      error: false,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      command: fullCommand,
      output: error instanceof Error ? error.message : "Command execution failed",
      error: true,
      timestamp: new Date().toISOString(),
    };
  }
}

// Function to get next investigation step based on context
async function getNextSmartInvestigationStep(
  message: string,
  previousSteps: StepResult[],
): Promise<{ command: string; description: string }> {
  const systemPrompt = `You are a Kubernetes expert designing investigation steps.
Current investigation focus: "${message}"
Previous steps and their results are provided.
Generate the next most relevant kubectl command to investigate the issue. Provide the response in JSON Format.
Response format: { "command": "kubectl command here", "description": "why this command is relevant" }`;

  const previousStepsText = previousSteps
    .map(step => `Step ${step.stepNumber}:
Command: ${step.commands[0].command}
Output: ${step.commands[0].output}
`)
    .join("\n");

  const humanPrompt = previousSteps.length > 0
    ? `Based on these previous steps:\n${previousStepsText}\nWhat should we investigate next?`
    : `This is the initial investigation. What's the best command to start investigating?`;

  try {
    const result = await OpenAIModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt)
    ]);

    return JSON.parse(result.content as string);
  } catch (error) {
    // Fallback commands if AI fails
    const fallbackCommands = [
      {
        command: 'kubectl get pods --all-namespaces -o wide',
        description: 'Checking pod status across all namespaces'
      },
      {
        command: 'kubectl describe nodes',
        description: 'Examining node conditions and resource usage'
      },
      {
        command: 'kubectl get events --all-namespaces --sort-by=.metadata.creationTimestamp',
        description: 'Reviewing recent cluster events'
      }
    ];

    return fallbackCommands[previousSteps.length % fallbackCommands.length];
  }
}

// Function to update investigation status
async function updateInvestigationStatus(
  investigationId: string,
  status: string,
  results?: StepResult[]
): Promise<void> {
  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (results) {
    const currentInvestigation = await prisma.investigation.findUnique({
      where: { id: investigationId },
    });

    if (currentInvestigation?.results) {
      const currentResults = currentInvestigation.results as any;
      updateData.results = {
        ...currentResults,
        steps: [...(currentResults.steps || []), ...results],
      };
    } else {
      updateData.results = { steps: results };
    }
  }

  await prisma.investigation.update({
    where: { id: investigationId },
    data: updateData,
  });
}

// Create worker
const worker = new Worker<SmartInvestigationJobData>(
  "smart-investigation-queue",
  async (job: Job<SmartInvestigationJobData>) => {
    try {
      const { investigationId, clusterId, message, results } = job.data;

      // Get cluster
      const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
      });

      if (!cluster) {
        throw new Error("Cluster not found");
      }

      let stepNumber = (results.steps.length || 0) + 1;
      let allResults: StepResult[] = [];

      // Execute 5 investigation steps
      const numberOfSteps = 3;
      for (let i = 0; i < numberOfSteps; i++) {
        // Get next step suggestion
        const nextStep = await getNextSmartInvestigationStep(
          message,
          [...results.steps, ...allResults]
        );

        // Execute the command
        const commandResult = await executeClusterCommand(
          nextStep.command.split(" "),
          cluster.externalEndpoint
        );

        // Create step result
        const stepResult: StepResult = {
          stepNumber,
          commands: [commandResult],
          timestamp: new Date().toISOString(),
          description: nextStep.description,
          summary: `Step ${stepNumber}: ${nextStep.description}`
        };

        allResults.push(stepResult);

        // Update investigation status
        await updateInvestigationStatus(
          investigationId,
          "IN_PROGRESS",
          allResults
        );

        // Update job progress
        await job.updateProgress((i + 1) * (100 / numberOfSteps));

        stepNumber++;
      }

      // Generate final summary
      const summaryPrompt = `Analyze these investigation steps and their results to create a final summary:
${allResults.map(step => `
Step ${step.stepNumber}: ${step.description}
Command: ${step.commands[0].command}
Output: ${step.commands[0].output}
`).join('\n')}

Format response as JSON: {
  "summary": "brief summary of findings",
  "issues": ["list of identified issues"],
  "recommendations": ["list of recommended actions"]
}`;

      const summaryResult = await OpenAIModel.invoke([
        new SystemMessage("You are a Kubernetes expert summarizing investigation results."),
        new HumanMessage(summaryPrompt)
      ]);

      const summary = JSON.parse(summaryResult.content as string);

      // Update final status with summary
      await updateInvestigationStatus(
        investigationId,
        "COMPLETED",
        allResults
      );

      // Convert results to a plain JSON-serializable object
      const serializedResults = {
        steps: allResults.map(step => ({
          stepNumber: step.stepNumber,
          commands: step.commands.map(cmd => ({
            command: cmd.command,
            output: cmd.output,
            error: cmd.error,
            timestamp: cmd.timestamp
          })),
          timestamp: step.timestamp,
          description: step.description,
          summary: step.summary
        })),
        status: "COMPLETED",
        summary: summary,
        completedAt: new Date().toISOString()
      };

      await prisma.investigation.update({
        where: { id: investigationId },
        data: {
          results: serializedResults as any // Type assertion needed for Prisma JSON field
        }
      });

      return {
        steps: allResults,
        summary,
        status: "COMPLETED",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Smart investigation failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      await prisma.investigation.update({
        where: { id: job.data.investigationId },
        data: {
          status: "FAILED",
          results: {
            error: {
              message: errorMessage,
              timestamp: new Date().toISOString(),
            }
          }
        }
      });

      throw error;
    }
  },
  {
    connection: redis.options,
    concurrency: 5,
  }
);

// Queue events
const queueEvents = new QueueEvents("smart-investigation-queue", {
  connection: redis.options,
});

queueEvents.on("completed", ({ jobId, returnvalue }) => {
  console.log(`Smart investigation job ${jobId} completed:`, returnvalue);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`Smart investigation job ${jobId} failed:`, failedReason);
});

queueEvents.on("progress", ({ jobId, data }) => {
  console.log(`Smart investigation job ${jobId} progress:`, data);
});

// Graceful shutdown
export async function closeSmartInvestigationQueue() {
  await worker.close();
  await queueEvents.close();
  await smartInvestigationQueue.close();
}

export default smartInvestigationQueue;