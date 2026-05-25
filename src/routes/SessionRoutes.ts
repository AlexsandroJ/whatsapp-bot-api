// src/routes/SessionRoutes.ts
import { Router, RequestHandler } from 'express';
import { protectRoute } from '../middleware/auth';
import * as SessionController from '../controllers/SessionController';

const router = Router();

// ✅ CORREÇÃO: Usar RequestHandler genérico
router.use(protectRoute as RequestHandler);

// CRUD
router.post('/', SessionController.createSession as RequestHandler);
router.get('/', SessionController.listSessions as RequestHandler);
router.get('/:sessionId', SessionController.getSession as RequestHandler);
router.post('/:sessionId/disconnect', SessionController.disconnectSession as RequestHandler);
router.delete('/:sessionId', SessionController.deleteSession as RequestHandler);

// Operações
router.post('/:sessionId/send-text', SessionController.sendSessionMessage as RequestHandler);
router.patch('/:sessionId/settings', SessionController.updateSessionSettings as RequestHandler);

// Utilitários
router.get('/:sessionId/qr', SessionController.getSessionQR as RequestHandler);
router.post('/:sessionId/reconnect', SessionController.reconnectSession as RequestHandler);

export default router;