import { Router } from "express";
import * as userController from "../controllers/user/user.controller";
import * as apiKeyController from "../controllers/apikey/apikey.controller";
import * as orgController from "../controllers/organization/organization.controller";
import * as clusterController from "../controllers/cluster/cluster.controller";
import * as billingController from "../controllers/billing/billing.controller";
import * as chatController from "../controllers/chat/chat.controller";
import sseMiddleware from "../middleware/sse.middleware";
import * as responseProtocolController from "../controllers/response-protocol/response-protocol.controller";
import * as investigationController from "../controllers/investigate/investigate.controller";
import * as shareController from "../controllers/share/share.controller";
import * as docusignController from "../controllers/docusign/docusign.controller";
import * as alertController from "../controllers/alerts/alerts.controller";
import { OpenAIModel } from "../services/openai/openai.services";
import { investigationPrompt } from "../internal/prompt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import prisma from '../connectors/prisma';
// import { validateApiKey } from '../middleware/auth';
import { verifyAuthToken } from "middleware/auth.middleware";
import { updateProtocolStats } from "controllers/response-protocol/response-protocol-stats";
const router = Router();

// User routes
router.post("/users", userController.createUser);
router.get("/users", verifyAuthToken, userController.getUsers);
router.post("/user/email", verifyAuthToken, userController.getUserByEmail);
router.get("/users/:id", verifyAuthToken, userController.getUserById);
router.put("/users/:id", verifyAuthToken, userController.updateUser);
router.delete("/users/:id", verifyAuthToken, userController.deleteUser);

// API Key routes
router.post("/api-keys", verifyAuthToken, apiKeyController.createApiKey);
router.get(
  "/users/:userId/api-keys",
  verifyAuthToken,
  apiKeyController.listApiKeys
);
router.delete("/api-keys/:id", verifyAuthToken, apiKeyController.revokeApiKey);
router.get("/api-keys/:id", verifyAuthToken, apiKeyController.getApiKeyById);

// Cluster registration (requires API key)
router.post("/register-cluster", apiKeyController.registerCluster);

// API Key validation
router.get("/validate-key", verifyAuthToken, apiKeyController.validateApiKey);

// Organization routes
router.post(
  "/organizations",
  verifyAuthToken,
  orgController.createOrganization
);
router.get("/organizations", verifyAuthToken, orgController.getOrganizations);
router.get(
  "/organizations/:id",
  verifyAuthToken,
  orgController.getOrganizationById
);
router.get(
  "/organizations/user/:userId",
  verifyAuthToken,
  orgController.getOrganizationsByUserId
);
router.get(
  "/organizations/email/:email",
  verifyAuthToken,
  orgController.getOrganizationsByUserEmail
);
router.delete(
  "/organizations/:id",
  verifyAuthToken,
  orgController.deleteOrganization
);
router.delete(
  "/organizations/email/:email",
  verifyAuthToken,
  orgController.deleteOrganizationsByUserEmail
);
router.patch(
  "/organizations/:id",
  verifyAuthToken,
  orgController.updateOrganization
);
router.delete(
  "/organizations/:orgId/members/:userId",
  verifyAuthToken,
  orgController.deleteMember
);
router.post(
  "/organizations/:orgId/members",
  verifyAuthToken,
  orgController.addMember
);
router.post(
  "/organizations/join/:token",
  verifyAuthToken,
  orgController.joinOrganization
);

router.get(
  "/members/:memberId/invite-token",
  verifyAuthToken,
  orgController.getInviteTokenByMemberId
);

// Cluster routes
router.get(
  "/organizations/:orgId/clusters",
  verifyAuthToken,
  clusterController.getOrganizationClusters
);
router.get(
  "/organizations/:orgId/users/:email/clusters",
  verifyAuthToken,
  clusterController.getOrganizationClustersByEmail
);
router.delete(
  "/clusters/:id",
  verifyAuthToken,
  clusterController.removeCluster
);
router.get(
  "/clusters/:id/health",
  verifyAuthToken,
  clusterController.checkClusterHealth
);
router.get(
  "/organizations/:orgId/clusters/health",
  verifyAuthToken,
  clusterController.checkAllClustersHealth
);

// Billing routes
router.get(
  "/users/:userId/subscription",
  verifyAuthToken,
  billingController.getUserSubscription
);
router.patch(
  "/users/:userId/subscription",
  verifyAuthToken,
  billingController.updateSubscription
);
router.post(
  "/users/:userId/subscription/cancel",
  verifyAuthToken,
  billingController.cancelSubscription
);
router.delete(
  "/users/:userId/subscription",
  verifyAuthToken,
  billingController.deleteSubscription
);

// Chat routes
router.post("/chat", verifyAuthToken, chatController.chat);
router.post(
  "/chat/stream",
  sseMiddleware,
  verifyAuthToken,
  chatController.chatStream
);
router.post("/chat/parse-intent", verifyAuthToken, chatController.parseIntent);
router.post(
  "/chat/test-stream",
  sseMiddleware,
  verifyAuthToken,
  chatController.testChatStream
);

// Response Protocol routes
router.post(
  "/organizations/protocols",
  responseProtocolController.createResponseProtocol
);
router.get(
  "/organizations/:orgId/protocols",
  responseProtocolController.getOrganizationProtocols
);
router.get("/protocols/:id", responseProtocolController.getResponseProtocol);
router.patch(
  "/protocols/:id",
  responseProtocolController.updateResponseProtocol
);
router.delete(
  "/protocols/:id",
  responseProtocolController.deleteResponseProtocol
);
router.post(
  "/protocols/import-yaml",
  responseProtocolController.importYamlProtocol
);
router.get(
  "/protocols/:id/export-yaml",
  responseProtocolController.exportYamlProtocol
);
router.get(
  "/protocols/:protocolId/stats",
  responseProtocolController.getProtocolStats
);

// Investigation routes
router.post(
  "/investigations",
  verifyAuthToken,
  investigationController.createInvestigation
);
router.post(
  "/investigations/:id/results",
  investigationController.updateInvestigationResults
);
router.post(
  "/investigations/:id",
  verifyAuthToken,
  investigationController.getInvestigation
);
router.get(
  "/organizations/:orgId/investigations",
  verifyAuthToken,
  investigationController.getOrganizationInvestigations
);
router.post(
  "/investigations/:id/cancel",
  verifyAuthToken,
  investigationController.cancelInvestigation
);
router.post(
  "/investigations/:id/further-investigate",
  verifyAuthToken,
  investigationController.FurtherInvestigate
);
router.post(
  "/investigation/smart-investigate",
  verifyAuthToken,
  investigationController.SmartInvestigation
);

// Share Routes
router.post("/investigation/create-link", shareController.createShareableLink);
router.get(
  "/investigation/share/:shareToken",
  shareController.getSharedInvestigation
);
router.post(
  "/investigation/share/:shareToken/revoke",
  shareController.revokeShareableLink
);

// Investigation -> Chat routes
router.post(
  "/investigation/summary",
  verifyAuthToken,
  chatController.getInvestigationSummary
);

router.post("/investigation/step/summary", async (req, res) => {
  try {
    const { commands } = req.body;

    if (!commands || !Array.isArray(commands)) {
      res.status(400).json({
        description: "Invalid input",
        summary: "Commands array is required",
      });
      return;
    }

    const commandHistory = commands
      .map((cmd) => {
        const sanitizedOutput = cmd.output
          .replace(/`/g, "'")
          .replace(/\\/g, "\\\\")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r")
          .replace(/\t/g, "\\t");
        return `Command: ${cmd.command}\nOutput:\n${sanitizedOutput}`;
      })
      .join("\n\n");

    const result = await OpenAIModel.invoke([
      new SystemMessage(investigationPrompt),
      new HumanMessage(
        `Please analyze the following kubectl commands and their outputs, providing a clear summary and description:\n\n${commandHistory}\n\nPlease respond with a valid JSON object containing 'summary' and 'description' fields.`
      ),
    ]);

    // Parse the response as JSON
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(result.content as string);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", result.content);
      parsedResponse = {
        summary: "Command execution analyzed",
        description: result.content || "Analysis completed",
      };
    }

    // Ensure we have valid string values
    const summary = String(
      parsedResponse.summary || "Command analysis complete"
    );
    const description = String(
      parsedResponse.description || "Analysis of kubectl command output"
    );

    res.json({
      description,
      summary,
    });
  } catch (error) {
    console.error("Summary generation error:", error);

    res.status(500).json({
      description: "Error generating summary",
      summary: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.post("/investigation/evaluate-condition", async (req, res) => {
  try {
    const { conditions, results } = req.body;

    if (
      !conditions ||
      !Array.isArray(conditions) ||
      !results ||
      !Array.isArray(results)
    ) {
      res.status(400).json({
        satisfied: false,
        reason: "Invalid input: conditions and results arrays are required",
      });
      return;
    }

    // Format the data for the OpenAI prompt
    const commandOutputs = results.map((result) => ({
      command: result.command,
      output: result.output,
      timestamp: result.timestamp,
    }));

    const prompt = `
Analyze the following kubectl command outputs and evaluate if they satisfy these conditions:

Conditions to check:
${conditions.map((condition, index) => `${index + 1}. ${condition}`).join("\n")}

Command outputs:
${commandOutputs
  .map(
    (output) => `
Command: ${output.command}
Output: ${output.output}
Timestamp: ${output.timestamp}
`
  )
  .join("\n")}

Please evaluate if ALL conditions are satisfied based on the command outputs.
Respond with a JSON object containing:
{
  "satisfied": boolean (true if ALL conditions are met, false otherwise),
  "reason": string (explanation of the evaluation)
}`;

    const result = await OpenAIModel.invoke([
      new SystemMessage(`You are a Kubernetes expert evaluating command outputs against conditions. 
          Always respond with valid JSON containing "satisfied" (boolean) and "reason" (string) fields.`),
      new HumanMessage(prompt),
    ]);

    let evaluation;
    try {
      evaluation = JSON.parse(result.content as string);
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", result.content);
      evaluation = {
        satisfied: false,
        reason: "Failed to evaluate conditions",
      };
    }

    res.json({
      satisfied: Boolean(evaluation.satisfied),
      reason: String(evaluation.reason || "Condition evaluation completed"),
    });
  } catch (error) {
    console.error("Condition evaluation error:", error);

    res.status(500).json({
      satisfied: false,
      reason:
        error instanceof Error
          ? error.message
          : "Unknown error during evaluation",
    });
  }
});

router.post("/investigation/next-step", async (req, res) => {
  try {
    const { message } = req.body;
    const systemPrompt = `You are a Kubernetes investigator. Generate investigative commands based on user intent. Output must be valid JSON in format:
{
  "command": "kubectl command",
  "description": "what this command investigates",
  "shouldRepeat": boolean,
  "repeatInterval": number in seconds
}`;

    const result = await OpenAIModel.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(message),
    ]);


    let parsed;
    try {
      parsed = JSON.parse(result.content as string);
    } catch (parseError) {
      res.status(500).json({
        command: "", // Fallback command
        description: "Failed to generate next step",
        shouldRepeat: false,
        repeatInterval: 30,
      });
      return;
    }

    res.json({
      command: parsed.command,
      description: parsed.description,
      shouldRepeat: parsed.shouldRepeat || false,
      repeatInterval: parsed.repeatInterval || 30,
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({
      command: "",
      description: "Failed to generate next step",
      shouldRepeat: false,
      repeatInterval: 30,
    });
  }
});

router.post('/protocols/:protocolId/stats', async (req, res) => {
  try {
    const { protocolId } = req.params;
    const success = await updateProtocolStats(protocolId);
    
    if (!success) {
      res.status(500).json({ error: 'Failed to update protocol stats' });
      return;
    }
    
    res.json({ message: 'Protocol stats updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update protocol stats' });
  }
});

router.put('/protocols/:protocolId/stats/update', async (req, res) => {
  try {
    const { protocolId } = req.params;
    const { status, executionTime } = req.body;

    await prisma.responseProtocolStats.upsert({
      where: { protocolId },
      update: {
        lastExecutionStatus: status,
        lastExecutionTime: new Date(),
        averageExecutionTime: {
          increment: executionTime
        },
        totalExecutions: {
          increment: status === 'COMPLETED' ? 1 : 0
        },
        successfulExecutions: {
          increment: status === 'COMPLETED' ? 1 : 0
        },
        failedExecutions: {
          increment: status === 'FAILED' ? 1 : 0
        },
        updatedAt: new Date(),
      },
      create: {
        protocolId,
        lastExecutionStatus: status,
        lastExecutionTime: new Date(),
        averageExecutionTime: executionTime,
        totalExecutions: status === 'COMPLETED' ? 1 : 0,
        successfulExecutions: status === 'COMPLETED' ? 1 : 0,
        failedExecutions: status === 'FAILED' ? 1 : 0,
      },
    });

    res.json({ message: 'Stats updated' });
  } catch (error) {
    console.error('Error updating stats:', error);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

router.post(
  "/docusign/consent",
  verifyAuthToken,
  docusignController.getConsentUrl
);
router.post(
  "/docusign/token",
  verifyAuthToken,
  docusignController.getAccessToken
);
router.post(
  "/docusign/userinfo",
  verifyAuthToken,
  docusignController.getUserInfo
);
router.post(
  "/docusign/sendenvelope",
  verifyAuthToken,
  docusignController.sendEnvelopeREST
);
// router.post('/docusign/userinfo', docusignController.getDocuSignUserInfo);

// alert routes
router.post(
  "/organizations/:orgId/alerts",
  verifyAuthToken,
  alertController.createAlertIntegration
);
router.get(
  "/organizations/:orgId/alerts",
  verifyAuthToken,
  alertController.getOrganizationAlertIntegrations
);
router.patch(
  "/alerts/:id",
  verifyAuthToken,
  alertController.updateAlertIntegration
);
router.delete(
  "/alerts/:id",
  verifyAuthToken,
  alertController.deleteAlertIntegration
);
router.post(
  "/alerts/:id/test",
  verifyAuthToken,
  alertController.testAlertIntegration
);

export default router;
