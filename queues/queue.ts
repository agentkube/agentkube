// queues/queue.ts
import { Queue, Worker, Job, QueueEvents } from "bullmq";
import { prisma } from "../connectors/prisma";
import redis from "../connectors/redis";
import {
  InvestigationJobData,
  CommandResult,
  StepResult,
  JobCompletionResult,
  InvestigationStatus,
  InvestigationResult,
} from "../types/investigation.types";
import { generateInvestigationSummary } from "../utils/investigation_summary";
import { updateProtocolStats } from "controllers/response-protocol/response-protocol-stats";
// Create queue instance

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const investigationQueue = new Queue<InvestigationJobData>(
  "investigation-queue",
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

// Create worker
const worker = new Worker<InvestigationJobData, JobCompletionResult>(
  "investigation-queue",
  async (job: Job<InvestigationJobData>) => {
    try {
      const {
        investigationId,
        protocolId,
        currentStepNumber,
        clusterId,
        // commandResults,
      } = job.data;

      console.log("Job being added to Worker", investigationId);
      // Get protocol and cluster
      const [protocol, cluster] = await Promise.all([
        prisma.responseProtocol.findUnique({
          where: { id: protocolId },
          include: {
            steps: {
              include: {
                commands: true,
                nextSteps: true,
              },
            },
          },
        }),
        prisma.cluster.findUnique({
          where: { id: clusterId },
        }),
      ]);

      if (!protocol || !cluster) {
        throw new Error("Protocol or cluster not found");
      }

      // Get current step
      let allResults: StepResult[] = [];

      // --- FROM HERE
      // --- STARTING INVESTIGATION
      
      for (const currentStep of protocol.steps) {

        await updateInvestigationStatus(investigationId, 'IN_PROGRESS', undefined, allResults, currentStep.number);
        console.log("Processing step:", currentStepNumber, currentStep.title);

        const stepResults: CommandResult[] = [];
        for (const command of currentStep.commands) {

          // TODO the command that is provided is valid kubectl command or suggested one
          // TODO format is the suggestion that is needed
          // Suggestion are based on docString, example and format, if it's runnable kubectl command then we run it.

          const executionResult = await executeClusterCommand(
            command.format.split(" ").slice(1),
            cluster.externalEndpoint
          );

          stepResults.push({
            command: executionResult.command,
            output: executionResult.output,
            error: false,
            timestamp: new Date().toISOString(),
          });
        }

        // Evaluate if the running step has any next step
        if (currentStep.nextSteps) {

          for (const nextStep of currentStep.nextSteps) {
            // exececute based on conditions not based on reference run (evaluateConditions)
            if (nextStep.referenceType === "STEP") {
              const nextStepNumber = nextStep.targetStepNumber;
              const nextExecutionStep = protocol.steps[nextStepNumber as number];


              if (nextExecutionStep) {
                for (const command of nextExecutionStep.commands) {
                  const executionResult = await executeClusterCommand(
                    command.format.split(" ").slice(1),
                    cluster.externalEndpoint
                  );
                  stepResults.push({
                    command: executionResult.command,
                    output: executionResult.output,
                    error: false,
                    timestamp: new Date().toISOString(),
                  });
                }
              }
              console.log("🚀 ----- End ofnextExecutionStep");
            } else if (
              nextStep.referenceType === "STOP" ||
              nextStep.referenceType === "FINAL"
            ) {
              // execute and break;
              console.log("🚀 -----STOP/FINAL End ofnextExecutionStep");
            }
          }

          /*
          Update progress to completion of current step
          */
         
          await job.updateProgress(
            (currentStep.number / protocol.steps.length) * 100
          );
        }

      /**
       * Analyzes kubectl commands and their outputs to generate an investigation summary
       */  
        const investigationSummary = await generateInvestigationSummary(stepResults);

        allResults.push({
          stepNumber: currentStep.number,
          commands: stepResults,
          timestamp: new Date().toISOString(),
          description: investigationSummary.description,
          summary: investigationSummary.summary,
        })

        await updateInvestigationStatus(
          investigationId, 
          'IN_PROGRESS', 
          undefined, 
          allResults, 
          currentStep.number
        );

        // console.log(stepResults)

      } // END OF STEPS




      // TILL HERE
      await updateInvestigationStatus(
        investigationId, 
        'COMPLETED', 
        undefined, 
        allResults
      );

      return {
        status: "completed",
        results: allResults,
      };
    } catch (error) {
      console.error("Job processing failed:", error);

      const errorMessage =
        error instanceof Error ? error.message : "Job processing failed";

      // Update investigation status on failure
      await updateInvestigationStatus(
        job.data.investigationId, 
        "FAILED", 
        {
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });

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

export const executeClusterCommand = async (
  command: string[],
  externalEndpoint: string
): Promise<CommandResult> => {
  try {
    const response = await fetch(`${externalEndpoint}/api/v1/kubectl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        command: command,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as CommandResult;
    return data;
  } catch (error) {
    const errorResult: CommandResult = {
      command: command.toString(),
      output:
        error instanceof Error ? error.message : "Command execution failed",
      error: true,
      timestamp: new Date().toISOString(),
    };
    return errorResult;
  }
};

// Helper function to update investigation status

export async function updateInvestigationStatus(
  investigationId: string,
  status: InvestigationStatus,
  error?: InvestigationResult["error"],
  results?: StepResult[],
  nextStepNumber?: number
) {

  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (error) {
    updateData.results = { ...updateData.results, error };
  }

  if (results) {
    updateData.results = { ...updateData.results, steps: results };
  }

  if (nextStepNumber) {
    updateData.currentStepNumber = nextStepNumber;
  }

  // TODO there no attribute called completedAt
  // if (status === 'COMPLETED' || status === 'FAILED') {
  //   updateData.completedAt = new Date();
  // }

  const investigation = await prisma.investigation.update({
    where: { id: investigationId },
    data: updateData,
    select: {
      protocolId: true
    }
  });

  if (status === 'COMPLETED' || status === 'FAILED') {
    await updateProtocolStats(investigation.protocolId);
  }
}

// Helper function to evaluate conditions
export function evaluateConditions(
  conditions: string[],
  results: CommandResult[]
): boolean {
  //TODO Integrate LLM here to evaiable the output response and return true or false

  return conditions.every((condition) => {
    try {
      // Create a safe evaluation context with results data
      const context = {
        results,
        hasError: results.some((r) => r.error),
        outputs: results.map((r) => r.output),
      };

      // Use Function constructor to create a safe evaluation environment
      const evalFn = new Function(
        "context",
        `with (context) { return ${condition}; }`
      );
      return evalFn(context);
    } catch (error) {
      console.error(`Error evaluating condition: ${condition}`, error);
      return false;
    }
  });
}

// Queue events and error handling
const queueEvents = new QueueEvents("investigation-queue", {
  connection: {
    host: redis.options.host as string,
    port: redis.options.port as number,
    password: redis.options.password,
  },
});

// Event handlers
queueEvents.on("completed", ({ jobId, returnvalue }) => {
  if (returnvalue){
    console.log(`Job ${jobId} completed with result`);
  }
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed with error:`, failedReason);
});

queueEvents.on("progress", ({ jobId, data }) => {
  console.log(`Job ${jobId} reported progress:`, data);
});

worker.on("error", (err) => {
  console.error("Worker error:", err);
});

// Graceful shutdown
export async function closeQueue() {
  await worker.close();
  await queueEvents.close();
  await investigationQueue.close();
}

// Handle process termination
process.on("SIGTERM", async () => {
  console.log("SIGTERM received. Closing queue connections...");
  await closeQueue();
  process.exit(0);
});

export default investigationQueue;
