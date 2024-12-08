import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import { decryptApiKey } from '../../utils/encryption';

// Get all clusters for an organization by orgId
export const getOrganizationClusters = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    const clusters = await prisma.cluster.findMany({
      where: {
        apiKey: {
          user: {
            members: {
              some: {
                orgId
              }
            }
          }
        }
      },
      select: {
        id: true,
        clusterName: true,
        accessType: true,
        externalEndpoint: true,
        status: true,
        lastHeartbeat: true,
        createdAt: true,
        updatedAt: true,
        apiKey: {
          select: {
            id: true,
            name: true,
            key: true 
          }
        }
      }
    });

    // Decrypt API keys before sending response
    const clustersWithDecryptedKeys = clusters.map(cluster => ({
      ...cluster,
      apiKey: cluster.apiKey ? {
        ...cluster.apiKey,
        key: decryptApiKey(cluster.apiKey.key)
      } : null
    }));

    res.json(clustersWithDecryptedKeys);
  } catch (error) {
    console.error('Error fetching organization clusters:', error);
    res.status(500).json({ error: 'Failed to fetch organization clusters' });
  }
};

// Get all clusters for an organization by orgId and user email
export const getOrganizationClustersByEmail = async (req: Request, res: Response) => {
  try {
    const { orgId, email } = req.params;

    const clusters = await prisma.cluster.findMany({
      where: {
        apiKey: {
          user: {
            email,
            members: {
              some: {
                orgId
              }
            }
          }
        }
      },
      select: {
        id: true,
        clusterName: true,
        accessType: true,
        externalEndpoint: true,
        status: true,
        lastHeartbeat: true,
        createdAt: true,
        updatedAt: true,
        apiKey: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        }
      }
    });

    res.json(clusters);
  } catch (error) {
    console.error('Error fetching organization clusters by email:', error);
    res.status(500).json({ error: 'Failed to fetch organization clusters' });
  }
};

// Remove cluster
export const removeCluster = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if cluster exists
    const cluster = await prisma.cluster.findUnique({
      where: { id }
    });

    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    // Delete the cluster
    await prisma.cluster.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error removing cluster:', error);
    res.status(500).json({ error: 'Failed to remove cluster' });
  }
};

// Interface for health check response
interface HealthCheckResponse {
  status: 'ACTIVE' | 'ERROR';
  lastChecked: Date;
  error?: string;
}

// Check cluster endpoint health
// Check cluster endpoint health
export const checkClusterHealth = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get cluster details
    const cluster = await prisma.cluster.findUnique({
      where: { id }
    });

    if (!cluster) {
      res.status(404).json({ error: 'Cluster not found' });
      return;
    }

    let healthCheck: HealthCheckResponse;
    
    try {
      // Try to connect to the cluster endpoint using fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(`${cluster.externalEndpoint}/health`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Update cluster status based on health check
      healthCheck = {
        status: 'ACTIVE',
        lastChecked: new Date()
      };

      // Update cluster status and last heartbeat
      await prisma.cluster.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          lastHeartbeat: new Date()
        }
      });

    } catch (error) {
      // If health check fails, update status to ERROR
      healthCheck = {
        status: 'ERROR',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Failed to connect to cluster'
      };

      // Update cluster status to ERROR
      await prisma.cluster.update({
        where: { id },
        data: {
          status: 'ERROR',
          lastHeartbeat: new Date()
        }
      });
    }

    res.json({
      id: cluster.id,
      clusterName: cluster.clusterName,
      healthCheck
    });

  } catch (error) {
    console.error('Error checking cluster health:', error);
    res.status(500).json({ error: 'Failed to check cluster health' });
  }
};

// Utility function to check health of multiple clusters
export const checkAllClustersHealth = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    // Get all clusters for the organization
    const clusters = await prisma.cluster.findMany({
      where: {
        apiKey: {
          user: {
            members: {
              some: {
                orgId
              }
            }
          }
        }
      }
    });

    // Check health for each cluster
    const healthChecks = await Promise.all(
      clusters.map(async (cluster) => {
        let healthCheck: HealthCheckResponse;
        
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(`${cluster.externalEndpoint}/health`, {
            signal: controller.signal,
            headers: {
              'Accept': 'application/json'
            }
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          healthCheck = {
            status: 'ACTIVE',
            lastChecked: new Date()
          };

          // Update cluster status
          await prisma.cluster.update({
            where: { id: cluster.id },
            data: {
              status: 'ACTIVE',
              lastHeartbeat: new Date()
            }
          });

        } catch (error) {
          healthCheck = {
            status: 'ERROR',
            lastChecked: new Date(),
            error: error instanceof Error ? error.message : 'Failed to connect to cluster'
          };

          // Update cluster status
          await prisma.cluster.update({
            where: { id: cluster.id },
            data: {
              status: 'ERROR',
              lastHeartbeat: new Date()
            }
          });
        }

        return {
          id: cluster.id,
          clusterName: cluster.clusterName,
          healthCheck
        };
      })
    );

    res.json(healthChecks);
  } catch (error) {
    console.error('Error checking clusters health:', error);
    res.status(500).json({ error: 'Failed to check clusters health' });
  }
};