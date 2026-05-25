// src/routes/BotRoutes.ts
import { Router, RequestHandler } from 'express';
import { protectRoute } from '../middleware/auth';
import * as BotController from '../controllers/BotController';

const router = Router();

// Health check público (sem auth)
router.get('/health', BotController.healthCheck as RequestHandler);

// Rotas protegidas
router.use(protectRoute as RequestHandler);

router.get('/status', BotController.getBotStatus as RequestHandler);
router.post('/reconnect', BotController.reconnectBot as RequestHandler);
router.delete('/disconnect', BotController.disconnectBot as RequestHandler);

router.post('/send-text', BotController.sendTextMessage as RequestHandler);
router.post('/send-image', BotController.sendImageMessage as RequestHandler);
router.post('/send-video', BotController.sendVideoMessage as RequestHandler);
router.post('/send-document', BotController.sendDocumentMessage as RequestHandler);
router.post('/send-audio', BotController.sendAudioMessage as RequestHandler);
router.post('/send-contact', BotController.sendContactMessage as RequestHandler);
router.post('/send-location', BotController.sendLocationMessage as RequestHandler);
router.post('/send-list', BotController.sendListMessage as RequestHandler);
router.post('/send-buttons', BotController.sendButtonsMessage as RequestHandler);

router.post('/mark-as-read', BotController.markAsRead as RequestHandler);
router.post('/send-reaction', BotController.sendReaction as RequestHandler);
router.post('/forward-message', BotController.forwardMessage as RequestHandler);
router.delete('/delete-message', BotController.deleteMessage as RequestHandler);

router.post('/verify-number', BotController.verifyNumber as RequestHandler);
router.post('/update-presence', BotController.updatePresence as RequestHandler);
router.post('/download-media', BotController.downloadMedia as RequestHandler);
router.get('/logs', BotController.getMessageLogs as RequestHandler);

export default router;