import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import bcrypt from 'bcryptjs';

export const createUser = async (req: Request, res: Response) => {
  try {
    const { email, password, name, orgId } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        orgId
      }
    });

    // // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    res.status(201).json(userWithoutPassword);
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
        organization: true,
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
        organization: true,
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

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        email,
        name,
        role
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        role: true,
        organization: true
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

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};