// src/controllers/investigation/investigation.controller.ts
import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import { investigationQueue } from '../../queues/queue';
import { InvestigationStatus } from '../../types/investigation.types';
import { furtherInvestigationQueue } from '../../queues/further-investigate.queue';
import { smartInvestigationQueue } from '../../queues/smart-investigation.queue';
import { parseSummary } from '../../utils/parse_intent_summary';
import { OpenAIModel } from '../../services/openai/openai.services'
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { InvestigationType, Prisma } from '@prisma/client';
// Create a new investigation
export const createInvestigation = async (req: Request, res: Response) => {
  try {
    const { protocolId, clusterId, userId } = req.body;

    // Validate request
    if (!protocolId || !clusterId || !userId) {
      res.status(400).json({
        error: 'Missing required fields: protocolId, clusterId, and user authentication are required'
      });
      return;
    }

    // Check if user has access to protocol's organization
    const protocol = await prisma.responseProtocol.findUnique({
      where: { id: protocolId },
      include: {
        organization: {
          include: {
            members: {
              where: {
                userId: userId
              }
            }
          }
        },
        steps: {
          include: {
            commands: true,
            nextSteps: true
          },
          orderBy: {
            number: 'asc'
          }
        }
      }
    });


    if (!protocol || protocol.organization.members.length === 0) {
      res.status(403).json({
        error: 'You do not have access to this protocol'
      });
      return;
    }

    // Check if cluster belongs to the same organization
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: {
        apiKey: {
          include: {
            user: {
              include: {
                members: {
                  where: {
                    orgId: protocol.orgId
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!cluster || cluster.apiKey.user.members.length === 0) {
      res.status(403).json({
        error: 'Cluster does not belong to the same organization as the protocol'
      });
      return;
    }

    // Check cluster status
    if (cluster.status !== 'ACTIVE') {
      res.status(400).json({
        error: 'Cluster is not active'
      });
      return;
    }

    // Create investigation record
    const investigation = await prisma.investigation.create({
      data: {
        protocolId,
        clusterId,
        status: 'PENDING' as InvestigationStatus,
        currentStepNumber: 1,
        results: {
          steps: [],
          status: 'PENDING' as InvestigationStatus,
          startedAt: new Date().toISOString()
        }
      }
    });

    // Add to queue
    const job = await investigationQueue.add('runInvestigation', {
      investigationId: investigation.id,
      protocolId,
      currentStepNumber: 1,
      clusterId,
      commandResults: []
    });

    res.status(201).json({
      message: 'Investigation created successfully',
      investigation,
      jobId: job.id
    });
  } catch (error) {
    console.error('Failed to create investigation:', error);
    res.status(500).json({
      error: 'Failed to create investigation'
    });
  }
};

// Get investigation by ID
export const getInvestigation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      res.status(401).json({
        error: 'Authentication required'
      });
      return;
    }

    const investigation = await prisma.investigation.findUnique({
      where: { id },
      include: {
        protocol: {
          include: {
            organization: {
              include: {
                members: {
                  where: {
                    userId: userId
                  }
                }
              }
            },
            steps: {
              include: {
                commands: true,
                nextSteps: true
              },
              orderBy: {
                number: 'asc'
              }
            }
          }
        },
        cluster: {
          select: {
            id: true,
            clusterName: true,
            status: true,
            externalEndpoint: true
          }
        }
      }
    });

    if (!investigation || investigation.protocol?.organization.members.length === 0) {
      res.status(404).json({
        error: 'Investigation not found'
      });
      return;
    }

    // Get job status
    const jobs = await investigationQueue.getJobs(['active', 'waiting', 'completed', 'failed']);
    const job = jobs.find(j => j.data.investigationId === id);
    
    let jobState = 'unknown';
    let progress = 0;

    if (job) {
      jobState = await job.getState();
      progress = await job.progress as number;
    }

    const result = {
      ...investigation,
      jobState,
      progress,
      currentStep: investigation.protocol?.steps.find(
        step => step.number === investigation.currentStepNumber
      ),
      results: investigation.results as Record<string, any> // Type assertion for results JSON
    };

    res.status(200).json(result);
  } catch (error) {
    console.error('Failed to get investigation:', error);
    res.status(500).json({
      error: 'Failed to get investigation'
    });
  }
};

// Get all investigations for an organization
export const getOrganizationInvestigations = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    // const { userId } = req.body;
    // if (!userId) {
    //   res.status(401).json({
    //     error: 'Authentication required'
    //   });
    //   return;
    // }
    // // Check if user belongs to organization
    // const member = await prisma.member.findFirst({
    //   where: {
    //     userId,
    //     orgId
    //   }
    // });
    // if (!member) {
    //   res.status(403).json({
    //     error: 'You do not have access to this organization'
    //   });
    //   return;
    // }

    const investigations = await prisma.investigation.findMany({
      select: {
        id: true,
        protocolId: true,
        clusterId: true,
        status: true,
        currentStepNumber: true,
        createdAt: true,
        updatedAt: true,
        protocol: {
          select: {
            name: true,
            description: true,
            steps: {
              select: {
                number: true,
                title: true
              },
              orderBy: {
                number: 'asc'
              }
            }
          }
        },
        cluster: {
          select: {
            clusterName: true,
            status: true
          }
        }
      },
      where: {
        protocol: {
          orgId
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get job statuses
    const jobs = await investigationQueue.getJobs(['active', 'waiting', 'completed', 'failed']);
    
    const investigationsWithStatus = await Promise.all(investigations.map(async (investigation) => {
      const job = jobs.find(j => j.data.investigationId === investigation.id);
      let jobState = 'unknown';
      let progress = 0;

      if (job) {
        jobState = await job.getState();
        progress = await job.progress as number;
      }

      return {
        ...investigation,
        jobState,
        progress,
        currentStep: investigation.protocol?.steps.find(
          step => step.number === investigation.currentStepNumber
        )
      };
    }));

    res.status(200).json(investigationsWithStatus);
  } catch (error) {
    console.error('Failed to get organization investigations:', error);
    res.status(500).json({
      error: 'Failed to get organization investigations'
    });
  }
};

// Cancel an investigation
export const cancelInvestigation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      res.status(401).json({
        error: 'Authentication required'
      });
      return;
    }

    const investigation = await prisma.investigation.findUnique({
      where: { id },
      include: {
        protocol: {
          include: {
            organization: {
              include: {
                members: {
                  where: {
                    userId
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!investigation || investigation.protocol?.organization.members.length === 0) {
      res.status(404).json({
        error: 'Investigation not found'
      });
      return;
    }

    // Remove jobs from queue
    const jobs = await investigationQueue.getJobs(['active', 'waiting']);
    const job = jobs.find(j => j.data.investigationId === id);
    
    if (job) {
      await job.remove();
    }

    // Update investigation status
    await prisma.investigation.update({
      where: { id },
      data: {
        status: 'CANCELED' as InvestigationStatus,
        results: {
          ...(investigation.results as Record<string, any>),
          status: 'CANCELED' as InvestigationStatus,
          completedAt: new Date().toISOString(),
          error: {
            message: 'Investigation canceled by user',
            timestamp: new Date().toISOString()
          }
        }
      }
    });

    res.status(200).json({
      message: 'Investigation canceled successfully'
    });
  } catch (error) {
    console.error('Failed to cancel investigation:', error);
    res.status(500).json({
      error: 'Failed to cancel investigation'
    });
  }
};



// Smart investigation
export const SmartInvestigation = async (req: Request, res: Response) => {
  try {
    const { clusterId, userId, message } = req.body;

    console.log(req.body);

    // Validate request
    if (!clusterId || !userId) {
      res.status(400).json({
        error: 'Missing required fields: clusterId and user authentication are required'
      });
      return;
    }

    if (!message) {
      res.status(400).json({
        error: 'Message is required to understand what to investigate'
      });
      return;
    }

    // Get cluster and verify access
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
      include: {
        apiKey: {
          include: {
            user: {
              include: {
                members: true
              }
            }
          }
        }
      }
    });

    if (!cluster) {
      res.status(404).json({
        error: 'Cluster not found'
      });
      return;
    }

    // Verify user has access to the cluster's organization
    const hasAccess = cluster.apiKey.user.members.some(
      member => member.userId === userId
    );

    if (!hasAccess) {
      res.status(403).json({
        error: 'You do not have access to this cluster'
      });
      return;
    }

    // Check cluster status
    if (cluster.status !== 'ACTIVE') {
      res.status(400).json({
        error: 'Cluster is not active'
      });
      return;
    }

    // Generate investigation name and description using OpenAI
    const prompt = `Given this Kubernetes investigation request: "${message}"
    Generate a JSON response with:
    1. A concise name (max 60 chars) summarizing the investigation focus
    2. A detailed description (1-2 sentences) explaining what will be investigated and why
    Format: {"name": "string", "description": "string"}`;

    const result = await OpenAIModel.invoke([
      new SystemMessage("You are a Kubernetes expert helping to name and describe cluster investigations. Be technical but clear."),
      new HumanMessage(prompt)
    ]);

    let investigationName = 'Smart Cluster Investigation';
    let investigationDescription = 'Automated investigation of cluster state and potential issues';

    try {
      const parsed = JSON.parse(result.content as string);
      investigationName = parsed.name;
      investigationDescription = parsed.description;
    } catch (error) {
      console.error('Failed to parse OpenAI response, using default name and description:', error);
    }

    // Prepare the serialized results
    const serializedResults = {
      steps: [],
      status: 'PENDING',
      startedAt: new Date().toISOString(),
      investigationFocus: message,
      metadata: {
        originalMessage: message,
        createdBy: userId,
        clusterName: cluster.clusterName,
        generatedName: investigationName,
        generatedDescription: investigationDescription
      }
    };

    const createData: Prisma.InvestigationUncheckedCreateInput = {
      type: InvestigationType.SMART,
      name: investigationName,
      description: investigationDescription,
      status: 'PENDING',
      currentStepNumber: 1,
      results: serializedResults,
      clusterId,
      protocolId: "cm4m854v700020xszsprbnv46"
    };

    // Create smart investigation
    const investigation = await prisma.investigation.create({
      data: createData,
      include: {
        cluster: true
      }
    });



    // Add to queue with special flag for smart investigation and message
    const job = await smartInvestigationQueue.add('smart-investigate', {
      investigationId: investigation.id,
      clusterId,
      message,
      results: {
        steps: []
      }
    });

    res.status(201).json({
      message: 'Smart investigation created successfully',
      investigation,
      jobId: job.id,
      focus: message
    });

  } catch (error) {
    console.error('Failed to create smart investigation:', error);
    res.status(500).json({
      error: 'Failed to create smart investigation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const FurtherInvestigate = async (req: Request, res: Response) => {
  try {
    const investigationId = req.params.id;
    const { clusterId, message } = req.body;

    // Validate request
    if (!clusterId || !investigationId) {
      res.status(400).json({
        error: 'Missing required fields: clusterId and investigationId are required'
      });
      return;
    }

    // Get cluster
    const cluster = await prisma.cluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      res.status(404).json({
        error: 'Cluster not found'
      });
      return;
    }

    // Get current investigation with results
    const investigation = await prisma.investigation.findUnique({
      where: { id: investigationId }
    });

    if (!investigation) {
      res.status(404).json({
        error: 'Investigation not found'
      });
      return;
    }

    // Safely extract and validate steps from investigation results
    const resultsData = investigation.results as unknown as { 
      steps: Array<{
        stepNumber: number;
        commands: Array<{
          command: string;
          output: string;
          error: boolean;
          timestamp: string;
        }>;
        timestamp: string;
        description: string;
        summary: string;
      }>;
    };

    if (!resultsData?.steps || !Array.isArray(resultsData.steps)) {
      res.status(400).json({
        error: 'Investigation has no valid results to analyze'
      });
      return;
    }

    // Get next command suggestion based on investigation results
    const nextStep = await parseSummary({
      summaries: resultsData.steps,
      message,
      accessType: "READ_ONLY"
    });

    if (!nextStep.command) {
      res.status(400).json({
        error: 'Failed to generate next investigation step'
      });
      return;
    }

    // Add job to further investigation queue
    const job = await furtherInvestigationQueue.add('further-investigate', {
      investigationId,
      clusterId,
      results: {
        steps: resultsData.steps
      }
    });

    res.status(200).json({
      message: 'Further investigation initiated',
      jobId: job.id,
      nextStep
    });

  } catch (error) {
    console.error('Failed to initiate further investigation:', error);
    res.status(500).json({
      error: 'Failed to initiate further investigation',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};