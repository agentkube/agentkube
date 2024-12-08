import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import { generateApiKey , encryptApiKey, decryptApiKey } from '../../utils/encryption';

export const createApiKey = async (req: Request, res: Response) => {
  try {
    const { name, userId } = req.body;

    // Generate new API key
    const apiKeyValue = generateApiKey();
    const encryptedKey = encryptApiKey(apiKeyValue);

    // Create API key record
    const apiKey = await prisma.apiKey.create({
      data: {
        key: encryptedKey,
        name,
        userId
      }
    });

    // Return the unencrypted API key only once
    res.status(201).json({
      ...apiKey,
      key: apiKeyValue
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
};

export const validateApiKey = async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers["x-api-key"] as string;

    if (!apiKey) {
      res.status(401).json({ error: 'API key is required' });
      return;
    }

    const apiKeys = await prisma.apiKey.findMany(); // Get all API keys
    let foundApiKey = null;

    // Find matching API key by decrypting and comparing
    for (const key of apiKeys) {
      try {
        const decryptedKey = decryptApiKey(key.key);
        if (decryptedKey === apiKey) {
          foundApiKey = key;
          break;
        }
      } catch (e) {
        // Skip invalid encrypted keys
        continue;
      }
    }

    if (!foundApiKey || !foundApiKey.isActive) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }

    // Update last used timestamp
    await prisma.apiKey.update({
      where: { id: foundApiKey.id },
      data: { lastUsedAt: new Date() }
    });

    const { key, ...safeApiKeyData } = foundApiKey;
    res.json(safeApiKeyData);
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({ error: 'Failed to validate API key' });
  }
};

export const registerCluster = async (req: Request, res: Response) => {
  try {
    const { clusterName, accessType, externalEndpoint } = req.body;
    const apiKey = req.headers["x-api-key"] as string;

    if (!apiKey) {
      res.status(401).json({ error: 'API key is required' });
      return;
    }

    // Find the API key by decrypting and comparing
    const apiKeys = await prisma.apiKey.findMany();
    let apiKeyRecord = null;

    for (const key of apiKeys) {
      try {
        const decryptedKey = decryptApiKey(key.key);
        if (decryptedKey === apiKey) {
          apiKeyRecord = key;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!apiKeyRecord || !apiKeyRecord.isActive) {
      res.status(401).json({ error: 'Invalid or inactive API key' });
      return;
    }

    // Upsert cluster registration
    const cluster = await prisma.cluster.upsert({
      where: {
        apiKeyId: apiKeyRecord.id
      },
      update: {
        clusterName,
        accessType: accessType || 'READ_ONLY',
        externalEndpoint,
        status: 'ACTIVE',
        updatedAt: new Date(),
        lastHeartbeat: new Date()
      },
      create: {
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

// The following functions remain mostly unchanged as they don't directly handle the encrypted key
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

    res.status(200).json({ message: `API key '${id}' has been revoked` });
  } catch (error) {
    console.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
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