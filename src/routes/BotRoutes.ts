// src/routes/BotRoutes.ts
import { Router } from 'express';
import { protectRoute } from '../middleware/auth';
import * as BotController from '../controllers/BotController';

const router = Router();

// ✅ Health check deve ser PÚBLICO (sem autenticação)
router.get('/health', BotController.healthCheck);

// ✅ Todas as outras rotas requerem autenticação JWT
router.use(protectRoute);

// Status e conexão
router.get('/status', BotController.getBotStatus);
router.post('/reconnect', BotController.reconnectBot);
router.delete('/disconnect', BotController.disconnectBot);

// Envio de mensagens de texto
router.post('/send-text', BotController.sendTextMessage);

// Envio de mídia
router.post('/send-image', BotController.sendImageMessage);
router.post('/send-video', BotController.sendVideoMessage);        // ← ADICIONAR
router.post('/send-document', BotController.sendDocumentMessage);  // ← ADICIONAR
router.post('/send-audio', BotController.sendAudioMessage);        // ← ADICIONAR

// Mensagens especiais
router.post('/send-contact', BotController.sendContactMessage);
router.post('/send-location', BotController.sendLocationMessage);
router.post('/send-list', BotController.sendListMessage);
router.post('/send-buttons', BotController.sendButtonsMessage);

// Gerenciamento de mensagens
router.post('/mark-as-read', BotController.markAsRead);            // ← ADICIONAR
router.post('/send-reaction', BotController.sendReaction);         // ← ADICIONAR
router.post('/forward-message', BotController.forwardMessage);     // ← ADICIONAR
router.delete('/delete-message', BotController.deleteMessage);     // ← ADICIONAR

// Utilitários
router.post('/verify-number', BotController.verifyNumber);
router.post('/update-presence', BotController.updatePresence);
router.post('/download-media', BotController.downloadMedia);       // ← ADICIONAR
router.get('/logs', BotController.getMessageLogs);

export default router;