// src/queue/queue.ts
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { prisma } from '../connectors/prisma';
import redis from '../connectors/redis';
import {
  InvestigationJobData,
  CommandResult,
  StepResult,
  JobCompletionResult,
  InvestigationStatus,
  InvestigationResult
} from '../types/investigation.types';

// Create queue instance
export const investigationQueue = new Queue<InvestigationJobData>('investigation-queue', {
  connection: {
    host: redis.options.host as string,
    port: redis.options.port as number,
    password: redis.options.password,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: {
      age: 24 * 3600,
      count: 1000
    },
    removeOnFail: {
      age: 7 * 24 * 3600
    }
  }
});

// Create worker
const worker = new Worker<InvestigationJobData, JobCompletionResult>(
  'investigation-queue',
  async (job: Job<InvestigationJobData>) => {
    try {
      const { investigationId, protocolId, currentStepNumber, clusterId, commandResults } = job.data;


      console.log("Job being added to Worker", investigationId)
      // Get protocol and cluster
      const [protocol, cluster] = await Promise.all([
        prisma.responseProtocol.findUnique({
          where: { id: protocolId },
          include: {
            steps: {
              include: {
                commands: true,
                nextSteps: true
              }
            }
          }
        }),
        prisma.cluster.findUnique({
          where: { id: clusterId }
        })
      ]);

      if (!protocol || !cluster) {
        throw new Error('Protocol or cluster not found');
      }

      // Get current step
      const currentStep = protocol.steps.find(step => step.number === currentStepNumber);
      if (!currentStep) {
        throw new Error(`Step ${currentStepNumber} not found`);
      }

      console.log("CurrentStep", currentStep)

      // Execute commands for current step
      const stepResults: CommandResult[] = [];
      for (const command of currentStep.commands) {
        try {
          // Update progress
          await job.updateProgress(
            ((currentStepNumber - 1) / protocol.steps.length) * 100
          );

          // Execute command on cluster
          const response = await fetch(`${cluster.externalEndpoint}/api/v1/kubectl`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              args: command.format.split(' ').slice(1)
            })
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json() as CommandResult;
          
          stepResults.push({
            command: command.format,
            output: data.output,
            error: false,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          const errorResult: CommandResult = {
            command: command.format,
            output: error instanceof Error ? error.message : 'Command execution failed',
            error: true,
            timestamp: new Date().toISOString()
          };
          stepResults.push(errorResult);

          // If command is not marked as readOnly, we should stop the investigation
          if (!command.readOnly) {
            await updateInvestigationStatus(
              investigationId, 
              'FAILED',
              {
                message: `Failed to execute command: ${command.format}`,
                step: currentStepNumber,
                command: command.format,
                timestamp: new Date().toISOString()
              }
            );
            throw new Error(`Critical command failed: ${command.format}`);
          }
        }
      }

      // Add results to history
      const updatedResults: StepResult[] = [
        ...commandResults,
        {
          stepNumber: currentStepNumber,
          commands: stepResults,
          timestamp: new Date().toISOString()
        }
      ];

      // Update progress to completion of current step
      await job.updateProgress(
        (currentStepNumber / protocol.steps.length) * 100
      );

      // Determine next step
      let nextStepNumber: number | null = null;

      // TODO evaluate next step feature 
      // for (const nextStep of currentStep.nextSteps) {
      //   if (nextStep.isUnconditional || evaluateConditions(nextStep.conditions, stepResults)) {
      //     if (nextStep.referenceType === 'STEP') {
      //       nextStepNumber = nextStep.targetStepNumber;
      //       break;
      //     } else if (nextStep.referenceType === 'STOP' || nextStep.referenceType === 'FINAL') {
      //       await updateInvestigationStatus(investigationId, 'COMPLETED', undefined, updatedResults);
      //       return { 
      //         status: 'completed', 
      //         results: updatedResults 
      //       };
      //     }
      //   }
      // }

      for (const nextStep of currentStep.nextSteps) {
        if (nextStep.referenceType === 'STEP') {
          nextStepNumber = nextStep.targetStepNumber;
          break;
        } else if (nextStep.referenceType === 'STOP' || nextStep.referenceType === 'FINAL') {
          await updateInvestigationStatus(investigationId, 'COMPLETED', undefined, updatedResults);
          return { 
            status: 'completed', 
            results: updatedResults 
          };
        }
      }



      if (nextStepNumber) {
        // Update investigation status and queue next step
        await updateInvestigationStatus(
          investigationId, 
          'IN_PROGRESS',
          undefined,
          updatedResults,
          nextStepNumber
        );

        // Add next step to queue
        await investigationQueue.add(
          'runInvestigation',
          {
            investigationId,
            protocolId,
            currentStepNumber: nextStepNumber,
            clusterId,
            commandResults: updatedResults
          }
        );
      }

      return { 
        status: 'completed', 
        results: updatedResults 
      };
    } catch (error) {
      console.error('Job processing failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Job processing failed';
      
      // Update investigation status on failure
      await updateInvestigationStatus(
        job.data.investigationId,
        'FAILED',
        {
          message: errorMessage,
          timestamp: new Date().toISOString()
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
    concurrency: 5
  }
);

// Helper function to update investigation status
// TODO issue is in updating investigation data
async function updateInvestigationStatus(
  investigationId: string,
  status: InvestigationStatus,
  error?: InvestigationResult['error'],
  results?: StepResult[],
  nextStepNumber?: number
) {

  console.log("😂 investigationId", investigationId)

  const updateData: any = {
    status,
    updatedAt: new Date()
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

  await prisma.investigation.update({
    where: { id: investigationId },
    data: updateData
  });
}

// Helper function to evaluate conditions
function evaluateConditions(conditions: string[], results: CommandResult[]): boolean {
  return conditions.every(condition => {
    try {
      // Create a safe evaluation context with results data
      const context = {
        results,
        hasError: results.some(r => r.error),
        outputs: results.map(r => r.output)
      };

      // Use Function constructor to create a safe evaluation environment
      const evalFn = new Function('context', `with (context) { return ${condition}; }`);
      return evalFn(context);
    } catch (error) {
      console.error(`Error evaluating condition: ${condition}`, error);
      return false;
    }
  });
}

// Queue events and error handling
const queueEvents = new QueueEvents('investigation-queue', {
  connection: {
    host: redis.options.host as string,
    port: redis.options.port as number,
    password: redis.options.password,
  },
});

// Event handlers
queueEvents.on('completed', ({ jobId, returnvalue }) => {
  console.log(`Job ${jobId} completed with result`);
});

queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`Job ${jobId} failed with error:`, failedReason);
});

queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`Job ${jobId} reported progress:`, data);
});

worker.on('error', err => {
  console.error('Worker error:', err);
});

// Graceful shutdown
export async function closeQueue() {
  await worker.close();
  await queueEvents.close();
  await investigationQueue.close();
}

// Handle process termination
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing queue connections...');
  await closeQueue();
  process.exit(0);
});

export default investigationQueue;