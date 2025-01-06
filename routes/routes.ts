import { Router } from 'express';
import * as userController from '../controllers/user/user.controller';
import * as apiKeyController from '../controllers/apikey/apikey.controller';
import * as orgController from '../controllers/organization/organization.controller';
import * as clusterController from '../controllers/cluster/cluster.controller';
import * as billingController from '../controllers/billing/billing.controller';
import * as chatController from '../controllers/chat/chat.controller';
import sseMiddleware from '../middleware/sse.middleware';
import * as responseProtocolController from '../controllers/response-protocol/response-protocol.controller';
import * as investigationController from '../controllers/investigate/investigate.controller';
import * as shareController from '../controllers/share/share.controller';
import * as docusignController from '../controllers/docusign/docusign.controller';
import * as alertController from '../controllers/alerts/alerts.controller';
// import { validateApiKey } from '../middleware/auth';
import { verifyAuthToken } from 'middleware/auth.middleware';
const router = Router();


// User routes
router.post('/users', verifyAuthToken, userController.createUser);
router.get('/users', verifyAuthToken, userController.getUsers);
router.post('/user/email', verifyAuthToken, userController.getUserByEmail);
router.get('/users/:id', verifyAuthToken, userController.getUserById);
router.put('/users/:id', verifyAuthToken, userController.updateUser);
router.delete('/users/:id', verifyAuthToken, userController.deleteUser);

// API Key routes
router.post('/api-keys', verifyAuthToken, apiKeyController.createApiKey);
router.get('/users/:userId/api-keys', verifyAuthToken, apiKeyController.listApiKeys);
router.delete('/api-keys/:id', verifyAuthToken, apiKeyController.revokeApiKey);
router.get('/api-keys/:id', verifyAuthToken, apiKeyController.getApiKeyById);


// Cluster registration (requires API key)
router.post('/register-cluster', apiKeyController.registerCluster);

// API Key validation
router.get('/validate-key', verifyAuthToken, apiKeyController.validateApiKey);


// Organization routes
router.post('/organizations', verifyAuthToken, orgController.createOrganization);
router.get('/organizations', verifyAuthToken, orgController.getOrganizations);
router.get('/organizations/:id', verifyAuthToken, orgController.getOrganizationById);
router.get('/organizations/user/:userId', verifyAuthToken, orgController.getOrganizationsByUserId);
router.get('/organizations/email/:email', verifyAuthToken, orgController.getOrganizationsByUserEmail);
router.delete('/organizations/:id', verifyAuthToken, orgController.deleteOrganization);
router.delete('/organizations/email/:email', verifyAuthToken, orgController.deleteOrganizationsByUserEmail);
router.patch('/organizations/:id', verifyAuthToken, orgController.updateOrganization);
router.delete('/organizations/:orgId/members/:userId', verifyAuthToken, orgController.deleteMember);
router.post('/organizations/:orgId/members', verifyAuthToken, orgController.addMember);
router.post('/organizations/join/:token', verifyAuthToken, orgController.joinOrganization);

router.get('/members/:memberId/invite-token', verifyAuthToken, orgController.getInviteTokenByMemberId);

// Cluster routes
router.get('/organizations/:orgId/clusters', verifyAuthToken, clusterController.getOrganizationClusters);
router.get('/organizations/:orgId/users/:email/clusters', verifyAuthToken, clusterController.getOrganizationClustersByEmail);
router.delete('/clusters/:id', verifyAuthToken, clusterController.removeCluster);
router.get('/clusters/:id/health', verifyAuthToken, clusterController.checkClusterHealth);
router.get('/organizations/:orgId/clusters/health', verifyAuthToken, clusterController.checkAllClustersHealth);


// Billing routes
router.get('/users/:userId/subscription', verifyAuthToken, billingController.getUserSubscription);
router.patch('/users/:userId/subscription', verifyAuthToken, billingController.updateSubscription);
router.post('/users/:userId/subscription/cancel', verifyAuthToken, billingController.cancelSubscription);
router.delete('/users/:userId/subscription', verifyAuthToken, billingController.deleteSubscription);


// Chat routes
router.post('/chat', verifyAuthToken, chatController.chat);
router.post('/chat/stream', sseMiddleware, verifyAuthToken, chatController.chatStream);
router.post('/chat/parse-intent', verifyAuthToken, chatController.parseIntent);
router.post('/chat/test-stream', sseMiddleware, verifyAuthToken, chatController.testChatStream);

// Response Protocol routes
router.post('/organizations/protocols', responseProtocolController.createResponseProtocol);
router.get('/organizations/:orgId/protocols', responseProtocolController.getOrganizationProtocols);
router.get('/protocols/:id', responseProtocolController.getResponseProtocol);
router.patch('/protocols/:id', responseProtocolController.updateResponseProtocol);
router.delete('/protocols/:id', responseProtocolController.deleteResponseProtocol);
router.post('/protocols/import-yaml', responseProtocolController.importYamlProtocol);
router.get('/protocols/:id/export-yaml', responseProtocolController.exportYamlProtocol);
router.get('/protocols/:protocolId/stats', responseProtocolController.getProtocolStats);


// Investigation routes
router.post('/investigations', verifyAuthToken, investigationController.createInvestigation);
router.post('/investigations/:id', verifyAuthToken, investigationController.getInvestigation);
router.get('/organizations/:orgId/investigations', verifyAuthToken, investigationController.getOrganizationInvestigations);
router.post('/investigations/:id/cancel', verifyAuthToken, investigationController.cancelInvestigation);
router.post('/investigations/:id/further-investigate', verifyAuthToken, investigationController.FurtherInvestigate);
router.post('/investigation/smart-investigate', verifyAuthToken, investigationController.SmartInvestigation);


// Share Routes
router.post('/investigation/create-link', shareController.createShareableLink);
router.get('/investigation/share/:shareToken', shareController.getSharedInvestigation);
router.post('/investigation/share/:shareToken/revoke', shareController.revokeShareableLink);

// Investigation -> Chat routes 
router.post('/investigation/summary',verifyAuthToken, chatController.getInvestigationSummary);


router.post('/docusign/consent', verifyAuthToken, docusignController.getConsentUrl);
router.post('/docusign/token', verifyAuthToken, docusignController.getAccessToken);
router.post('/docusign/userinfo', verifyAuthToken, docusignController.getUserInfo);
router.post('/docusign/sendenvelope', verifyAuthToken, docusignController.sendEnvelopeREST);
// router.post('/docusign/userinfo', docusignController.getDocuSignUserInfo);

// alert routes
router.post('/organizations/:orgId/alerts', verifyAuthToken, alertController.createAlertIntegration);
router.get('/organizations/:orgId/alerts', verifyAuthToken, alertController.getOrganizationAlertIntegrations);
router.patch('/alerts/:id', verifyAuthToken, alertController.updateAlertIntegration);
router.delete('/alerts/:id', verifyAuthToken, alertController.deleteAlertIntegration);
router.post('/alerts/:id/test', verifyAuthToken, alertController.testAlertIntegration);

export default router;