// queues/further-investigation.ts
import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { prisma } from "../connectors/prisma";
import redis from "../connectors/redis";
import { OpenAIModel } from "../services/openai/openai.services";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { CommandResult, StepResult } from '../types/investigation.types'
import { 
  InvestigationStatus, 
  FurtherInvestigationJobData, 
  FurtherInvestigationResponse,
  FurtherInvestigationResult,
} from '../types/further-investigation.types';
import { furtherInvestigation } from '../internal/prompt'; 


// Create queue instance
export const furtherInvestigationQueue = new Queue<FurtherInvestigationJobData>(
  "further-investigation-queue",
  {
    connection: {
      host: redis.options.host as string,
      port: redis.options.port as number,
      password: redis.options.password,
    },
    defaultJobOptions: {
      attempts: 3,
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


// Function to get next investigation step
async function getNextInvestigationStep(
  summaries: StepResult[],
  shouldRepeat: boolean = false
): Promise<FurtherInvestigationResponse> {
  const summaryText = summaries
    .map((s) => `Step ${s.stepNumber}:\n${s.description}\n${s.summary}`)
    .join("\n\n");

  // If repeating, use the last command
  if (shouldRepeat && summaries.length > 0) {
    const lastStep = summaries[summaries.length - 1];
    const lastCommand = lastStep.commands[lastStep.commands.length - 1];
    if (lastCommand) {
      return {
        command: lastCommand.command,
        description: `Continuing to monitor: ${lastCommand.command}`,
        shouldRepeat: true,
        repeatInterval: 30 // Default 30 seconds interval
      };
    }
  }

  try {
    const result = await OpenAIModel.invoke([
      new SystemMessage(furtherInvestigation),
      new HumanMessage(`Based on these investigation results, what should we investigate next:\n\n${summaryText}`),
    ]);

    const parsed = JSON.parse(result.content as string);
    return {
      command: parsed.command,
      description: parsed.description,
      shouldRepeat: parsed.shouldRepeat || false,
      repeatInterval: parsed.repeatInterval
    };
  } catch (error) {
    throw new Error("Failed to generate next investigation step");
  }
}

// Function to update investigation status
async function updateInvestigationStatus(
  investigationId: string,
  status: InvestigationStatus,
  results?: StepResult[]
): Promise<void> {
  const updateData: any = {
    status: status.type,
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

  if (status.error) {
    updateData.results = {
      ...updateData.results,
      error: status.error,
    };
  }

  await prisma.investigation.update({
    where: { id: investigationId },
    data: updateData,
  });
}

// Sleep utility
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Create worker
const worker = new Worker<FurtherInvestigationJobData, FurtherInvestigationResult>(
  "further-investigation-queue",
  async (job: Job<FurtherInvestigationJobData>) => {
    try {
      const { investigationId, clusterId, results, repeatCommand = false } = job.data;

      // Get cluster
      const cluster = await prisma.cluster.findUnique({
        where: { id: clusterId },
      });

      if (!cluster) {
        throw new Error("Cluster not found");
      }

      let stepNumber = (results.steps.length || 0) + 1;
      let allResults: StepResult[] = [];

      // Get and execute 1 further investigation steps
      const numberOfDebuggingSteps = 1
      for (let i = 0; i < numberOfDebuggingSteps; i++) {
        // Get next step suggestion
        const shouldRepeat = repeatCommand && i > 0;
        const nextStep = await getNextInvestigationStep(
          [...results.steps, ...allResults],
          shouldRepeat
        );

        // If repeating command, wait for the interval
        if (shouldRepeat && nextStep.repeatInterval) {
          await sleep(nextStep.repeatInterval * 1000);
        }

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
          summary: shouldRepeat 
            ? `Monitoring update: ${nextStep.description}`
            : `Investigated based on previous findings: ${nextStep.description}`,
        };

        allResults.push(stepResult);

        // Update investigation status
        await updateInvestigationStatus(
          investigationId,
          { type: "IN_PROGRESS" },
          allResults
        );

        // Update job progress
        await job.updateProgress((i + 1) * 33);

        stepNumber++;
      }

      // Update final status
      await updateInvestigationStatus(
        investigationId,
        { type: "COMPLETED" },
        allResults
      );

      return {
        steps: allResults,
        status: { type: "COMPLETED" },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Further investigation failed:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      await updateInvestigationStatus(
        job.data.investigationId,
        {
          type: "FAILED",
          error: {
            message: errorMessage,
            timestamp: new Date().toISOString(),
          },
        }
      );

      throw error;
    }
  },
  {
    connection: {
      host: redis.options.host as string,
      port: redis.options.port as number,
      password: redis.options.password,
    },
    concurrency: 5,
  }
);

// Queue events
const queueEvents = new QueueEvents("further-investigation-queue", {
  connection: {
    host: redis.options.host as string,
    port: redis.options.port as number,
    password: redis.options.password,
  },
});

queueEvents.on("completed", ({ jobId, returnvalue }) => {
  if (returnvalue) {
    console.log(`Further investigation job ${jobId} completed`);
  }
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`Further investigation job ${jobId} failed:`, failedReason);
});

queueEvents.on("progress", ({ jobId, data }) => {
  console.log(`Further investigation job ${jobId} progress:`, data);
});

// Graceful shutdown
export async function closeFurtherInvestigationQueue() {
  await worker.close();
  await queueEvents.close();
  await furtherInvestigationQueue.close();
}

export default furtherInvestigationQueue;