import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import { Prisma as PrismaClient, StepReferenceType } from '@prisma/client';
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

    res.status(201).json(protocol);
  } catch (error) {
    console.error('Error creating response protocol:', error);
    res.status(500).json({ error: 'Failed to create response protocol' });
  }
};

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
        }
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
    await prisma.responseProtocol.update({
      where: { id },
      data: { isActive: false }
    });

    res.status(204).json({ message: "Response Protocol deleted successfully."});
  } catch (error) {
    console.error('Error deleting response protocol:', error);
    res.status(500).json({ error: 'Failed to delete response protocol' });
  }
};