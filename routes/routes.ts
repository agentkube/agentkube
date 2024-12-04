import { Router } from 'express';
import * as userController from '../controllers/user/user.controller';
import * as apiKeyController from '../controllers/apikey/apikey.controller';
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

// Cluster registration (requires API key)
router.post('/register-cluster', apiKeyController.registerCluster);

// API Key validation
router.get('/validate-key', apiKeyController.validateApiKey);

export default router;