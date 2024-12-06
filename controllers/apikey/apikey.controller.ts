import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import crypto from 'crypto';

// Generate a secure API key
const generateApiKey = () => {
  return `ak_${crypto.randomBytes(32).toString('hex')}`;
};

// Hash API key for storage
const hashApiKey = (apiKey: string) => {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
};

export const createApiKey = async (req: Request, res: Response) => {
  try {
    const { name, userId } = req.body;

    // Generate new API key
    const apiKeyValue = generateApiKey();
    const hashedKey = hashApiKey(apiKeyValue);

    // Create API key record
    const apiKey = await prisma.apiKey.create({
      data: {
        key: hashedKey,
        name,
        userId
      }
    });

    // Return the unhashed API key only once
    res.status(201).json({
      ...apiKey,
      key: apiKeyValue // Send the original API key value
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
};

export const registerCluster = async (req: Request, res: Response) => {
  try {
    const { clusterName, accessType, externalEndpoint } = req.body;
    const apiKey = req.headers.authorization?.split(' ')[1];

    if (!apiKey) {
      res.status(401).json({ error: 'API key is required' });
      return;
    }

    const hashedKey = hashApiKey(apiKey);

    // Find API key record
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key: hashedKey }
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }

    // Create or update cluster registration
    const cluster = await prisma.cluster.create({
      data: {
        clusterName,
        accessType: accessType || 'READ_ONLY',
        externalEndpoint,
        apiKeyId: apiKeyRecord.id,
        status: 'ACTIVE'
      }
    });

    res.status(201).json(cluster);
  } catch (error) {
    console.error('Error registering cluster:', error);
    res.status(500).json({ error: 'Failed to register cluster' });
  }
};

export const listApiKeys = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        cluster: {
          select: {
            id: true,
            clusterName: true,
            accessType: true,
            externalEndpoint: true,
            status: true,
            lastHeartbeat: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    // The cluster will automatically be null if it doesn't exist
    // No need to sanitize the key field since we're using select instead of include
    res.json(apiKeys);
  } catch (error) {
    console.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
};

export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.apiKey.delete({
      where: { id }
    });

    res.status(200).json({ message: `Apikey '${id}' has been revoked`});
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
};

export const validateApiKey = async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-api-key"] as string;

    if (!apiKey) {
      res.status(401).json({ error: 'API key is required' });
      return;
    }

    const hashedKey = hashApiKey(apiKey);

    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { key: hashedKey },
      include: {
        cluster: true
      }
    });

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() }
    });

    const { key, ...safeApiKeyData } = apiKeyRecord;
    res.json(safeApiKeyData);
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({ error: 'Failed to validate API key' });
  }
};

export const getApiKeyById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        userId: true,
        cluster: {
          select: {
            id: true,
            clusterName: true,
            accessType: true,
            externalEndpoint: true,
            status: true,
            lastHeartbeat: true,
            createdAt: true,
            updatedAt: true
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      }
    });

    if (!apiKey) {
      res.status(404).json({ error: 'API key not found' });
      return;
    }

    res.json(apiKey);
  } catch (error) {
    console.error('Error fetching API key:', error);
    res.status(500).json({ error: 'Failed to fetch API key' });
  }
};