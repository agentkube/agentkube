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

// import { validateApiKey } from '../middleware/auth';

const router = Router();

// User routes
router.post('/users', userController.createUser);
router.get('/users', userController.getUsers);
router.get('/users/:id', userController.getUserById);
router.put('/users/:id', userController.updateUser);
router.delete('/users/:id', userController.deleteUser);

// API Key routes
router.post('/api-keys', apiKeyController.createApiKey);
router.get('/users/:userId/api-keys', apiKeyController.listApiKeys);
router.delete('/api-keys/:id', apiKeyController.revokeApiKey);
router.get('/api-keys/:id', apiKeyController.getApiKeyById);


// Cluster registration (requires API key)
router.post('/register-cluster', apiKeyController.registerCluster);

// API Key validation
router.get('/validate-key', apiKeyController.validateApiKey);


// Organization routes
router.post('/organizations', orgController.createOrganization);
router.get('/organizations', orgController.getOrganizations);
router.get('/organizations/:id', orgController.getOrganizationById);
router.get('/organizations/user/:userId', orgController.getOrganizationsByUserId);
router.get('/organizations/email/:email', orgController.getOrganizationsByUserEmail);
router.delete('/organizations/:id', orgController.deleteOrganization);
router.delete('/organizations/email/:email', orgController.deleteOrganizationsByUserEmail);
router.patch('/organizations/:id', orgController.updateOrganization);
router.delete('/organizations/:orgId/members/:userId', orgController.deleteMember);
router.post('/organizations/:orgId/members', orgController.addMember);
router.post('/organizations/join/:token', orgController.joinOrganization);

router.get('/members/:memberId/invite-token', orgController.getInviteTokenByMemberId);

// Cluster routes
router.get('/organizations/:orgId/clusters', clusterController.getOrganizationClusters);
router.get('/organizations/:orgId/users/:email/clusters', clusterController.getOrganizationClustersByEmail);
router.delete('/clusters/:id', clusterController.removeCluster);
router.get('/clusters/:id/health', clusterController.checkClusterHealth);
router.get('/organizations/:orgId/clusters/health', clusterController.checkAllClustersHealth);


// Billing routes
router.get('/users/:userId/subscription', billingController.getUserSubscription);
router.patch('/users/:userId/subscription', billingController.updateSubscription);
router.post('/users/:userId/subscription/cancel', billingController.cancelSubscription);
router.delete('/users/:userId/subscription', billingController.deleteSubscription);


// Chat routes
router.post('/chat', chatController.chat);
router.post('/chat/stream', sseMiddleware, chatController.chatStream);
router.post('/chat/test-stream', sseMiddleware, chatController.testChatStream);

// Response Protocol routes
router.post('/organizations/protocols', responseProtocolController.createResponseProtocol);
router.get('/organizations/:orgId/protocols', responseProtocolController.getOrganizationProtocols);
router.get('/protocols/:id', responseProtocolController.getResponseProtocol);
router.patch('/protocols/:id', responseProtocolController.updateResponseProtocol);
router.delete('/protocols/:id', responseProtocolController.deleteResponseProtocol);


// Investigation routes
router.post('/investigations', investigationController.createInvestigation);
router.post('/investigations/:id', investigationController.getInvestigation);
router.get('/organizations/:orgId/investigations', investigationController.getOrganizationInvestigations);
router.post('/investigations/:id/cancel', investigationController.cancelInvestigation);


export default router;