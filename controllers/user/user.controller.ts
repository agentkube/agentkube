import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import bcrypt from 'bcryptjs';
import { BillingPeriod, SubscriptionStatus, PlanType } from '@prisma/client';

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, planType = PlanType.FREE } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    // Create user with subscription
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        subscription: {
          create: {
            plan: {
              create: {
                name: `${planType} Plan`,
                planType: planType,
                monthlyPrice: 0,
                yearlyPrice: 0,
                maxClusters: planType === PlanType.FREE ? 1 : 5
              }
            },
            billingPeriod: BillingPeriod.MONTHLY,
            startDate: new Date(),
            status: SubscriptionStatus.ACTIVE,
            amount: 0
          }
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        subscription: {
          select: {
            plan: true,
            status: true,
            billingPeriod: true
          }
        }
      }
    });

    res.status(201).json(user);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

export const getUsers = async (_: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        members: {
          select: {
            organization: true,
            role: true
          }
        },
        apiKeys: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            isActive: true
          }
        }
      }
    });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        members: {
          select: {
            organization: true,
            role: true
          }
        },
        apiKeys: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            isActive: true
          }
        },
        subscription: {
          select: {
            plan: true,
            status: true,
            billingPeriod: true,
            endDate: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { email, name, role } = req.body;


    if (email) {
      const existingUser = await prisma.user.findUnique({
        where: { 
          email,
          NOT: {
            id
          }
        }
      });

      if (existingUser) {
        res.status(400).json({ error: 'Email already in use' });
        return;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        ...(email && { email }),
        ...(name && { name }),
        ...(role && { role })
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        members: {
          select: {
            organization: true,
            role: true
          }
        }
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id }
    });

    res.status(200).send({ message: "user has been deleted."});
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};


export const getUserByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        members: {
          select: {
            organization: true,
            role: true
          }
        },
        apiKeys: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            isActive: true
          }
        },
        subscription: {
          select: {
            plan: true,
            status: true,
            billingPeriod: true,
            endDate: true
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user by email:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};