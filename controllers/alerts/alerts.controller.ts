import { Request, Response } from 'express';
import prisma from '../../connectors/prisma';
import { AlertIntegrationType } from '@prisma/client';

// Type definitions for supported alert integrations
type IntegrationConfig = {
  // Messaging Platforms
  SLACK: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };
  TEAMS: {
    webhookUrl: string;
    channel?: string;
  };
  DISCORD: {
    webhookUrl: string;
    channel?: string;
  };
  MATTERMOST: {
    webhookUrl: string;
    channel?: string;
  };
  ROCKETCHAT: {
    webhookUrl: string;
    channel?: string;
  };
  // Incident Management
  PAGERDUTY: {
    apiKey: string;
    serviceId: string;
    severity?: string;
  };
  OPSGENIE: {
    apiKey: string;
    teamId?: string;
  };
  VICTOROPS: {
    apiKey: string;
    routingKey: string;
  };
  SERVICENOW: {
    instanceUrl: string;
    username: string;
    password: string;
  };
  // Monitoring & Observability
  DATADOG: {
    apiKey: string;
    applicationKey: string;
  };
  NEWRELIC: {
    apiKey: string;
    accountId: string;
  };
  PROMETHEUS: {
    url: string;
    username?: string;
    password?: string;
  };
  // Email
  EMAIL: {
    smtpHost: string;
    smtpPort: number;
    username: string;
    password: string;
    fromAddress: string;
  };
  // Collaboration Tools
  JIRA: {
    host: string;
    username: string;
    apiToken: string;
    projectKey: string;
  };
  LINEAR: {
    apiKey: string;
    teamId: string;
  };
  MONDAY: {
    apiKey: string;
    boardId: string;
  };
  // Webhook
  WEBHOOK: {
    url: string;
    headers?: Record<string, string>;
    method?: 'POST' | 'PUT';
  };
};

// Create a new alert integration
export const createAlertIntegration = async (req: Request, res: Response) => {
  try {
    const { 
      orgId, 
      type, 
      name,
      config,
      enabled = true 
    } = req.body;
    const { userId } = req.body; // Assuming this comes from auth middleware

    // Validate request
    if (!orgId || !type || !config) {
      res.status(400).json({
        error: 'Missing required fields: orgId, type, and config are required'
      });
      return;
    }

    // Verify user has access to organization
    const member = await prisma.member.findFirst({
      where: {
        userId,
        orgId
      }
    });

    if (!member) {
      res.status(403).json({
        error: 'You do not have access to this organization'
      });
      return;
    }

    // Validate configuration based on integration type
    const validationError = validateIntegrationConfig(type as keyof IntegrationConfig, config);
    if (validationError) {
      res.status(400).json({
        error: `Invalid configuration: ${validationError}`
      });
      return;
    }

    // Create alert integration
    const alertIntegration = await prisma.alertConfiguration.create({
      data: {
        name: name || type,
        type: type as AlertIntegrationType,
        config,
        enabled,
        organization: {
          connect: {
            id: orgId
          }
        }
      }
    });

    res.status(201).json({
      message: 'Alert integration created successfully',
      alertIntegration
    });
  } catch (error) {
    console.error('Failed to create alert integration:', error);
    res.status(500).json({
      error: 'Failed to create alert integration'
    });
  }
};

// Update an existing alert integration
export const updateAlertIntegration = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { config, enabled, name } = req.body;
    const { userId } = req.body; // From auth middleware

    const alertIntegration = await prisma.alertConfiguration.findUnique({
      where: { id },
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
    });

    if (!alertIntegration || alertIntegration.organization.members.length === 0) {
      res.status(404).json({
        error: 'Alert integration not found or access denied'
      });
      return;
    }

    if (config) {
      const validationError = validateIntegrationConfig(
        alertIntegration.type as keyof IntegrationConfig, 
        config
      );
      if (validationError) {
        res.status(400).json({
          error: `Invalid configuration: ${validationError}`
        });
        return;
      }
    }

    const updatedIntegration = await prisma.alertConfiguration.update({
      where: { id },
      data: {
        config: config || undefined,
        enabled: enabled !== undefined ? enabled : undefined,
        name: name || undefined
      }
    });

    res.status(200).json({
      message: 'Alert integration updated successfully',
      alertIntegration: updatedIntegration
    });
  } catch (error) {
    console.error('Failed to update alert integration:', error);
    res.status(500).json({
      error: 'Failed to update alert integration'
    });
  }
};

// Delete an alert integration
export const deleteAlertIntegration = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // From auth middleware

    const alertIntegration = await prisma.alertConfiguration.findUnique({
      where: { id },
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
    });

    if (!alertIntegration || alertIntegration.organization.members.length === 0) {
      res.status(404).json({
        error: 'Alert integration not found or access denied'
      });
      return;
    }

    await prisma.alertConfiguration.delete({
      where: { id }
    });

    res.status(200).json({
      message: 'Alert integration deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete alert integration:', error);
    res.status(500).json({
      error: 'Failed to delete alert integration'
    });
  }
};

// Get all alert integrations for an organization
export const getOrganizationAlertIntegrations = async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { userId } = req.body; // From auth middleware

    // Verify user has access to organization
    const member = await prisma.member.findFirst({
      where: {
        userId,
        orgId
      }
    });

    if (!member) {
      res.status(403).json({
        error: 'You do not have access to this organization'
      });
      return;
    }

    const alertIntegrations = await prisma.alertConfiguration.findMany({
      where: {
        orgId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json(alertIntegrations);
  } catch (error) {
    console.error('Failed to get organization alert integrations:', error);
    res.status(500).json({
      error: 'Failed to get organization alert integrations'
    });
  }
};

// Test an alert integration
export const testAlertIntegration = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // From auth middleware

    const alertIntegration = await prisma.alertConfiguration.findUnique({
      where: { id },
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
    });

    if (!alertIntegration || alertIntegration.organization.members.length === 0) {
      res.status(404).json({
        error: 'Alert integration not found or access denied'
      });
      return;
    }

    // Send test notification based on integration type
    const testResult = await sendTestNotification(
      alertIntegration.type as keyof IntegrationConfig,
      alertIntegration.config
    );

    if (!testResult.success) {
      res.status(400).json({
        error: `Test failed: ${testResult.error}`
      });
      return;
    }

    res.status(200).json({
      message: 'Test notification sent successfully',
      details: testResult.details
    });
  } catch (error) {
    console.error('Failed to test alert integration:', error);
    res.status(500).json({
      error: 'Failed to test alert integration'
    });
  }
};

// Helper function to validate integration config
function validateIntegrationConfig(
  type: keyof IntegrationConfig, 
  config: any
): string | null {
  // Basic validation for required fields based on integration type
  switch (type) {
    case 'SLACK':
    case 'TEAMS':
    case 'DISCORD':
    case 'MATTERMOST':
    case 'ROCKETCHAT':
    case 'WEBHOOK':
      if (!config.webhookUrl) return 'Webhook URL is required';
      break;

    case 'PAGERDUTY':
      if (!config.apiKey) return 'API key is required';
      if (!config.serviceId) return 'Service ID is required';
      break;

    case 'OPSGENIE':
      if (!config.apiKey) return 'API key is required';
      break;

    case 'VICTOROPS':
      if (!config.apiKey) return 'API key is required';
      if (!config.routingKey) return 'Routing key is required';
      break;

    case 'SERVICENOW':
      if (!config.instanceUrl) return 'Instance URL is required';
      if (!config.username) return 'Username is required';
      if (!config.password) return 'Password is required';
      break;

    case 'DATADOG':
      if (!config.apiKey) return 'API key is required';
      if (!config.applicationKey) return 'Application key is required';
      break;

    case 'NEWRELIC':
      if (!config.apiKey) return 'API key is required';
      if (!config.accountId) return 'Account ID is required';
      break;

    case 'PROMETHEUS':
      if (!config.url) return 'URL is required';
      break;

    case 'EMAIL':
      if (!config.smtpHost) return 'SMTP host is required';
      if (!config.smtpPort) return 'SMTP port is required';
      if (!config.username) return 'Username is required';
      if (!config.password) return 'Password is required';
      if (!config.fromAddress) return 'From address is required';
      break;

    case 'JIRA':
      if (!config.host) return 'Host is required';
      if (!config.username) return 'Username is required';
      if (!config.apiToken) return 'API token is required';
      if (!config.projectKey) return 'Project key is required';
      break;

    case 'LINEAR':
      if (!config.apiKey) return 'API key is required';
      if (!config.teamId) return 'Team ID is required';
      break;

    case 'MONDAY':
      if (!config.apiKey) return 'API key is required';
      if (!config.boardId) return 'Board ID is required';
      break;

    default:
      return 'Invalid integration type';
  }

  return null;
}

// Helper function to send test notifications
async function sendTestNotification(
  type: keyof IntegrationConfig,
  config: any
): Promise<{ success: boolean; error?: string; details?: any }> {
  try {
    // Implementation for each integration type would go here
    // This is a placeholder that would need to be implemented based on each service's API

  
    const testMessage = {
      title: 'Test Notification',
      message: 'This is a test notification from your alert integration.'
    };

    console.log(testMessage, config)

    // Mock implementation - in reality, you would make actual API calls here
    switch (type) {
      case 'SLACK':
        // Implement Slack webhook call
        break;
      case 'TEAMS':
        // Implement Teams webhook call
        break;
      // ... implement other integration types
    }

    return { success: true, details: { message: 'Test notification sent' } };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}