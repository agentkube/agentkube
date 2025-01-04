import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import { Prisma as PrismaClient, StepReferenceType } from '@prisma/client';
import { parse, stringify } from 'yaml';
import { updateProtocolStats } from './response-protocol-stats';
// import { Step, Command } from '@prisma/client';
// Create a new response protocol
export const createResponseProtocol = async (req: Request, res: Response) => {
  try {
    const { userId, orgId, name, description, steps } = req.body;

    const protocol = await prisma.responseProtocol.create({
      data: {
        name,
        description,
        organization: {
          connect: { id: orgId }
        },
        createdBy: {
          connect: { id: userId }
        },
        steps: {
          create: steps.map((step: any) => ({
            number: step.number,
            title: step.title,
            details: step.details,
            commands: {
              create: step.commands.map((command: any) => ({
                format: command.format,
                docString: command.docString,
                example: command.example,
                readOnly: command.readOnly ?? false,
                order: command.order ?? 0
              }))
            },
            nextSteps: {
              create: step.nextSteps.map((nextStep: any) => ({
                referenceType: nextStep.referenceType as StepReferenceType,
                targetStepNumber: nextStep.targetStepNumber,
                conditions: nextStep.conditions,
                isUnconditional: nextStep.isUnconditional ?? false,
                order: nextStep.order ?? 0
              }))
            }
          }))
        }
      },
      include: {
        steps: {
          include: {
            commands: {
              orderBy: {
                order: 'asc'
              }
            },
            nextSteps: {
              orderBy: {
                order: 'asc'
              }
            }
          }
        }
      }
    });
    if (protocol.id){
      res.status(201).json({
        message: `Response protocol ${protocol.id} created successfully`
      });
    }
  } catch (error) {
    console.error('Error creating response protocol:', error);
    res.status(500).json({ error: 'Failed to create response protocol' });
  }
};

    // TODO while patching compare it previous if new changes are added patch it
    // TODO otherwise remove those content for other table and patch it
    // For example while patching there can a step removed, if patch it in Protocol its removed but will it be removed from NextStep tables
    
// Update a response protocol
export const updateResponseProtocol = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, steps } = req.body;

    const protocol = await prisma.responseProtocol.findUnique({
      where: { id }
    });

    if (!protocol) {
      res.status(404).json({ error: 'Response protocol not found' });
      return;
    }

    const updatedProtocol = await prisma.$transaction(async (tx) => {
      // Delete existing steps and their related data
      await tx.step.deleteMany({
        where: { protocolId: id }
      });

      // Update protocol and create new steps
      return await tx.responseProtocol.update({
        where: { id },
        data: {
          name,
          description,
          updatedAt: new Date(),
          version: { increment: 1 },
          steps: {
            create: steps.map((step: any) => ({
              number: step.number,
              title: step.title,
              details: step.details,
              commands: {
                create: step.commands.map((command: any) => ({
                  format: command.format,
                  docString: command.docString,
                  example: command.example,
                  readOnly: command.readOnly ?? false,
                  order: command.order ?? 0
                }))
              },
              nextSteps: {
                create: step.nextSteps.map((nextStep: any) => ({
                  referenceType: nextStep.referenceType as StepReferenceType,
                  targetStepNumber: nextStep.targetStepNumber,
                  conditions: nextStep.conditions,
                  isUnconditional: nextStep.isUnconditional ?? false,
                  order: nextStep.order ?? 0
                }))
              }
            }))
          }
        },
        include: {
          steps: {
            include: {
              commands: {
                orderBy: {
                  order: 'asc'
                }
              },
              nextSteps: {
                orderBy: {
                  order: 'asc'
                }
              }
            }
          }
        }
      });
    });

    res.json(updatedProtocol);
  } catch (error) {
    console.error('Error updating response protocol:', error);
    res.status(500).json({ error: 'Failed to update response protocol' });
  }
};

// Get a response protocol by ID
export const getResponseProtocol = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const protocol = await prisma.responseProtocol.findUnique({
      where: { id },
      include: {
        steps: {
          include: {
            commands: {
              orderBy: {
                order: 'asc'
              }
            },
            nextSteps: {
              orderBy: {
                order: 'asc'
              }
            }
          },
          orderBy: {
            number: 'asc'
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        stats: true
      }
    });

    if (!protocol) {
      res.status(404).json({ error: 'Response protocol not found' });
      return;
    }

    res.json(protocol);
  } catch (error) {
    console.error('Error fetching response protocol:', error);
    res.status(500).json({ error: 'Failed to fetch response protocol' });
  }
};


// Get all response protocols for an organization
export const getOrganizationProtocols = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { page = 1, limit = 10, search } = req.query;

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const whereClause: PrismaClient.ResponseProtocolWhereInput = {
      orgId,
      ...(search && {
        OR: [
          {
            name: {
              contains: String(search),
              mode: 'insensitive' as PrismaClient.QueryMode // Explicitly type the mode
            }
          },
          {
            description: {
              contains: String(search),
              mode: 'insensitive' as PrismaClient.QueryMode // Explicitly type the mode
            }
          }
        ]
      })
    };

    // Rest of your code remains the same
    const [protocols, total] = await Promise.all([
      prisma.responseProtocol.findMany({
        where: whereClause,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          steps: {
            select: {
              id: true,
              number: true,
              title: true
            }
          }
        },
        skip,
        take: Number(limit),
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.responseProtocol.count({ where: whereClause })
    ]);

    res.json({
      protocols,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching organization protocols:', error);
    res.status(500).json({ error: 'Failed to fetch organization protocols' });
  }
};

// Delete a response protocol (soft delete)
export const deleteResponseProtocol = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const protocol = await prisma.responseProtocol.findUnique({
      where: { id }
    });

    if (!protocol) {
      res.status(404).json({ error: 'Response protocol not found' });
      return;
    }

    // Soft delete by setting isActive to false
    await prisma.responseProtocol.delete({
      where: { id }
    });

    res.status(200).json({ message: "Response Protocol deleted successfully."});
  } catch (error) {
    console.error('Error deleting response protocol:', error);
    res.status(500).json({ error: 'Failed to delete response protocol' });
  }
};


// Import YAML and create response protocol
export const importYamlProtocol = async (req: Request, res: Response) => {
  try {
    const { userId, orgId, yamlContent } = req.body;

    // Parse YAML content using the yaml package
    const protocol = parse(yamlContent) as any;

    // Transform YAML data to match our schema
    const transformedData = {
      userId,
      orgId,
      name: protocol.name,
      description: protocol.description,
      steps: protocol.steps.map((step: any) => ({
        number: step.number,
        title: step.title,
        details: step.details || '',
        commands: step.commands.map((cmd: any, cmdIndex: number) => ({
          format: cmd.format,
          docString: cmd.docString || '',
          example: cmd.example || '',
          readOnly: cmd.readOnly || false,
          order: cmdIndex
        })),
        nextSteps: (step.nextSteps || []).map((next: any, nextIndex: number) => ({
          referenceType: next.referenceType as StepReferenceType,
          targetStepNumber: next.targetStepNumber,
          conditions: next.conditions || [],
          isUnconditional: next.isUnconditional || false,
          order: nextIndex
        }))
      }))
    };

    // Create protocol using existing createResponseProtocol logic
    const createdProtocol = await prisma.responseProtocol.create({
      data: {
        name: transformedData.name,
        description: transformedData.description,
        organization: {
          connect: { id: orgId }
        },
        createdBy: {
          connect: { id: userId }
        },
        steps: {
          create: transformedData.steps.map((step: any) => ({
            number: step.number,
            title: step.title,
            details: step.details,
            commands: {
              create: step.commands
            },
            nextSteps: {
              create: step.nextSteps
            }
          }))
        }
      },
      include: {
        steps: {
          include: {
            commands: {
              orderBy: {
                order: 'asc'
              }
            },
            nextSteps: {
              orderBy: {
                order: 'asc'
              }
            }
          }
        }
      }
    });

    res.status(201).json({
      message: `Response protocol ${createdProtocol.id} created successfully from YAML`,
      protocol: createdProtocol
    });
  } catch (error) {
    console.error('Error importing YAML protocol:', error);
    if (error instanceof Error) {
      res.status(500).json({ error: `Failed to import YAML protocol: ${error.message}` });
    } else {
      res.status(500).json({ error: 'Failed to import YAML protocol' });
    }
  }
};

// Export response protocol as YAML
export const exportYamlProtocol = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch protocol with all related data
    const protocol = await prisma.responseProtocol.findUnique({
      where: { id },
      include: {
        steps: {
          include: {
            commands: {
              orderBy: {
                order: 'asc'
              }
            },
            nextSteps: {
              orderBy: {
                order: 'asc'
              }
            }
          },
          orderBy: {
            number: 'asc'
          }
        }
      }
    });

    if (!protocol) {
      res.status(404).json({ error: 'Response protocol not found' });
      return;
    }

    // Transform data for YAML export
    const yamlData = {
      name: protocol.name,
      description: protocol.description,
      steps: protocol.steps.map(step => ({
        title: step.title,
        number: step.number,
        details: step.details,
        commands: step.commands.map(cmd => ({
          docString: cmd.docString,
          example: cmd.example,
          format: cmd.format,
          readOnly: cmd.readOnly
        })),
        nextSteps: step.nextSteps.map(next => ({
          referenceType: next.referenceType,
          conditions: next.conditions,
          isUnconditional: next.isUnconditional,
          ...(next.targetStepNumber && { targetStepNumber: next.targetStepNumber })
        }))
      }))
    };

    // Convert to YAML using the yaml package
    const yamlContent = stringify(yamlData, {
      indent: 2,
      lineWidth: -1  // Don't wrap lines
    });

    // Set headers for YAML download
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Content-Disposition', `attachment; filename="protocol-${id}.yaml"`);
    res.send(yamlContent);

  } catch (error) {
    console.error('Error exporting protocol as YAML:', error);
    if (error instanceof Error) {
      res.status(500).json({ error: `Failed to export protocol as YAML: ${error.message}` });
    } else {
      res.status(500).json({ error: 'Failed to export protocol as YAML' });
    }
  }
};


export const getProtocolStats = async (req: Request, res: Response) => {
  try {
    const { protocolId } = req.params;

    // Get or create stats
    const stats = await prisma.responseProtocolStats.findUnique({
      where: {
        protocolId,
      },
    });

    if (!stats) {
      // If no stats exist, calculate them now
      await updateProtocolStats(protocolId);
      const freshStats = await prisma.responseProtocolStats.findUnique({
        where: {
          protocolId,
        },
      });
      res.json(freshStats);
    } else {
      res.json(stats);
    }
  } catch (error) {
    console.error('Error fetching protocol stats:', error);
    res.status(500).json({ error: 'Failed to fetch protocol statistics' });
  }
};