import { Request, Response, NextFunction } from 'express';
import { whatsappService } from '../services/WhatsAppService';
import MessageLog from '../models/MessageLog';

// ==================== TIPOS E UTILITÁRIOS ====================

type MediaRequestBody = {
  number: string;
  media: string | Buffer;
  mimetype: string;
  caption?: string;
  filename?: string;
};

type ContactRequestBody = {
  number: string;
  contact: { name: string; phone: string };
};

type LocationRequestBody = {
  number: string;
  latitude: number;
  longitude: number;
  name?: string;
};

// Helper para sanitizar número de telefone
const sanitizeNumber = (number: string): string => {
  return number.replace(/\D/g, '');
};

// Helper para resposta de erro padronizada
const sendErrorResponse = (
  res: Response,
  error: any,
  defaultMessage: string,
  context: string
): void => {
  console.error(`❌ Erro ${context}:`, error);
  
  const isNotReady = error.message?.includes('não está pronto');
  const statusCode = isNotReady ? 503 : 500;
  
  res.status(statusCode).json({
    success: false,
    message: error.message || defaultMessage,
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
};

// ==================== STATUS E CONEXÃO ====================

/**
 * GET /api/bot/status
 * Retorna o status atual da conexão do bot
 */
export const getBotStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = {
      connected: whatsappService.getStatus(),
      connecting: whatsappService.isConnectingStatus(),
      client: whatsappService.getClient() ? 'active' : 'inactive',
      timestamp: new Date().toISOString()
    };

    res.json({ success: true, data: status });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Erro interno ao verificar status', 'getBotStatus');
  }
};

/**
 * POST /api/bot/reconnect
 * Reconecta o bot manualmente
 */
export const reconnectBot = async (req: Request, res: Response): Promise<void> => {
  try {
    if (whatsappService.isConnectingStatus()) {
      res.status(409).json({ 
        success: false, 
        message: 'Reconexão já em andamento' 
      });
      return;
    }

    await whatsappService.reconnect();
    
    res.json({ 
      success: true, 
      message: 'Reconexão iniciada. Aguarde o QR Code ou confirmação de conexão.' 
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao iniciar reconexão', 'reconnectBot');
  }
};

/**
 * DELETE /api/bot/disconnect
 * Desconecta o bot gracefulmente
 */
export const disconnectBot = async (req: Request, res: Response): Promise<void> => {
  try {
    await whatsappService.disconnect();
    
    res.json({ 
      success: true, 
      message: 'Bot desconectado com sucesso' 
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao desconectar bot', 'disconnectBot');
  }
};

// ==================== ENVIO DE MENSAGENS DE TEXTO ====================

/**
 * POST /api/bot/send-text
 * Envia mensagem de texto para um número
 */
export const sendTextMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, message, quoted } = req.body;

    if (!number || !message) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number" e "message" são obrigatórios' 
      });
      return;
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Mensagem deve ser uma string não vazia' 
      });
      return;
    }

    const result = await whatsappService.sendMessage(
      sanitizeNumber(number), 
      message, 
      quoted ? { quoted } : undefined
    );

    await MessageLog.create({
      direction: 'outbound',
      type: 'text',
      recipient: number,
      content: message,
      messageId: result.id,
      status: result.status
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar mensagem', 'sendTextMessage');
  }
};

// ==================== ENVIO DE MÍDIA ====================

/**
 * POST /api/bot/send-image
 * Envia imagem para um número
 */
export const sendImageMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, media, mimetype, caption, filename } = req.body as MediaRequestBody;

    if (!number || !media || !mimetype) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "media" e "mimetype" são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.sendImage(sanitizeNumber(number), {
      media,
      mimetype,
      caption,
      filename
    });

    await MessageLog.create({
      direction: 'outbound',
      type: 'image',
      recipient: number,
      content: caption || '[Imagem]',
      messageId: result.id,
      status: result.status,
      metadata: { mimetype, filename }
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar imagem', 'sendImageMessage');
  }
};

/**
 * POST /api/bot/send-video
 * Envia vídeo para um número
 */
export const sendVideoMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, media, mimetype, caption, filename } = req.body as MediaRequestBody;

    if (!number || !media || !mimetype) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "media" e "mimetype" são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.sendVideo(sanitizeNumber(number), {
      media,
      mimetype,
      caption,
      filename
    });

    await MessageLog.create({
      direction: 'outbound',
      type: 'video',
      recipient: number,
      content: caption || '[Vídeo]',
      messageId: result.id,
      status: result.status,
      metadata: { mimetype, filename }
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar vídeo', 'sendVideoMessage');
  }
};

/**
 * POST /api/bot/send-document
 * Envia documento para um número
 */
export const sendDocumentMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, media, mimetype, caption, filename } = req.body as MediaRequestBody;

    if (!number || !media || !mimetype) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "media" e "mimetype" são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.sendDocument(sanitizeNumber(number), {
      media,
      mimetype,
      caption,
      filename: filename || 'document'
    });

    await MessageLog.create({
      direction: 'outbound',
      type: 'document',
      recipient: number,
      content: caption || filename || '[Documento]',
      messageId: result.id,
      status: result.status,
      metadata: { mimetype, filename }
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar documento', 'sendDocumentMessage');
  }
};

/**
 * POST /api/bot/send-audio
 * Envia áudio ou nota de voz para um número
 */
export const sendAudioMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, media, mimetype, ptt } = req.body as MediaRequestBody & { ptt?: boolean };

    if (!number || !media || !mimetype) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "media" e "mimetype" são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.sendAudio(sanitizeNumber(number), {
      media,
      mimetype,
      ptt
    });

    await MessageLog.create({
      direction: 'outbound',
      type: ptt ? 'ptt' : 'audio',
      recipient: number,
      content: ptt ? '[Nota de voz]' : '[Áudio]',
      messageId: result.id,
      status: result.status,
      metadata: { mimetype, ptt }
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar áudio', 'sendAudioMessage');
  }
};

// ==================== MENSAGENS ESPECIAIS ====================

/**
 * POST /api/bot/send-contact
 * Envia contato para um número
 */
export const sendContactMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, contact } = req.body as ContactRequestBody;

    if (!number || !contact?.name || !contact?.phone) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "contact.name" e "contact.phone" são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.sendContact(sanitizeNumber(number), {
      name: contact.name,
      number: sanitizeNumber(contact.phone)
    });

    await MessageLog.create({
      direction: 'outbound',
      type: 'contact',
      recipient: number,
      content: `${contact.name} - ${contact.phone}`,
      messageId: result.id,
      status: result.status
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar contato', 'sendContactMessage');
  }
};

/**
 * POST /api/bot/send-location
 * Envia localização para um número
 */
export const sendLocationMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, latitude, longitude, name } = req.body as LocationRequestBody;

    if (!number || latitude === undefined || longitude === undefined) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "latitude" e "longitude" são obrigatórios' 
      });
      return;
    }

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      res.status(400).json({ 
        success: false, 
        message: 'Latitude e longitude devem ser números' 
      });
      return;
    }

    const result = await whatsappService.sendLocation(sanitizeNumber(number), {
      latitude,
      longitude,
      name
    });

    await MessageLog.create({
      direction: 'outbound',
      type: 'location',
      recipient: number,
      content: name || `Lat: ${latitude}, Lng: ${longitude}`,
      messageId: result.id,
      status: result.status,
      metadata: { latitude, longitude }
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar localização', 'sendLocationMessage');
  }
};

/**
 * POST /api/bot/send-list
 * Envia lista interativa para um número
 */
export const sendListMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, title, description, buttonText, sections } = req.body;

    if (!number || !title || !description || !buttonText || !Array.isArray(sections)) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "title", "description", "buttonText" e "sections" são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.sendList(
      sanitizeNumber(number), 
      title, 
      description, 
      buttonText, 
      sections
    );

    await MessageLog.create({
      direction: 'outbound',
      type: 'list',
      recipient: number,
      content: title,
      messageId: result.id,
      status: result.status
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar lista interativa', 'sendListMessage');
  }
};

/**
 * POST /api/bot/send-buttons
 * Envia botões de resposta rápida para um número
 */
export const sendButtonsMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, text, buttons } = req.body;

    if (!number || !text || !Array.isArray(buttons) || buttons.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "text" e "buttons" (não vazio) são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.sendButtons(sanitizeNumber(number), text, buttons);

    await MessageLog.create({
      direction: 'outbound',
      type: 'buttons',
      recipient: number,
      content: text,
      messageId: result.id,
      status: result.status
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar botões', 'sendButtonsMessage');
  }
};

// ==================== GERENCIAMENTO DE MENSAGENS ====================

/**
 * POST /api/bot/mark-as-read
 * Marca mensagens como lidas
 */
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, messageIds } = req.body;

    if (!number || !Array.isArray(messageIds) || messageIds.length === 0) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number" e "messageIds" (array não vazio) são obrigatórios' 
      });
      return;
    }

    await whatsappService.markAsRead(sanitizeNumber(number), messageIds);

    res.json({ 
      success: true, 
      message: `${messageIds.length} mensagem(ns) marcada(s) como lida(s)` 
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao marcar mensagens como lidas', 'markAsRead');
  }
};

/**
 * POST /api/bot/send-reaction
 * Reage a uma mensagem com emoji
 */
export const sendReaction = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, messageId, reaction } = req.body;

    if (!number || !messageId || !reaction) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number", "messageId" e "reaction" são obrigatórios' 
      });
      return;
    }

    await whatsappService.sendReaction(sanitizeNumber(number), messageId, reaction);

    res.json({ 
      success: true, 
      message: `Reação "${reaction}" enviada para mensagem ${messageId}` 
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao enviar reação', 'sendReaction');
  }
};

/**
 * POST /api/bot/forward-message
 * Encaminha uma mensagem recebida
 */
export const forwardMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, message, forceForward } = req.body;

    if (!number || !message?.key?.id) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number" e "message" (com key.id) são obrigatórios' 
      });
      return;
    }

    const result = await whatsappService.forwardMessage(
      sanitizeNumber(number), 
      message, 
      { forceForward }
    );

    res.json({ success: true, data: result });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao encaminhar mensagem', 'forwardMessage');
  }
};

/**
 * DELETE /api/bot/delete-message
 * Deleta uma mensagem
 */
export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, messageId, onlyForMe } = req.body;

    if (!number || !messageId) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number" e "messageId" são obrigatórios' 
      });
      return;
    }

    await whatsappService.deleteMessage(sanitizeNumber(number), messageId, onlyForMe);

    res.json({ 
      success: true, 
      message: `Mensagem ${messageId} deletada ${onlyForMe ? 'apenas para você' : 'para todos'}` 
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao deletar mensagem', 'deleteMessage');
  }
};

// ==================== UTILITÁRIOS ====================

/**
 * POST /api/bot/verify-number
 * Verifica se um número existe no WhatsApp
 */
export const verifyNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number } = req.body;

    if (!number) {
      res.status(400).json({ 
        success: false, 
        message: 'Campo "number" é obrigatório' 
      });
      return;
    }

    const result = await whatsappService.verifyNumber(sanitizeNumber(number));

    res.json({ 
      success: true, 
      data: { 
        exists: result.exists, 
        jid: result.jid,
        checkedAt: new Date().toISOString()
      } 
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao verificar número', 'verifyNumber');
  }
};

/**
 * POST /api/bot/update-presence
 * Atualiza presença do bot para um contato
 */
export const updatePresence = async (req: Request, res: Response): Promise<void> => {
  try {
    const { number, presence } = req.body;
    const validPresences = ['available', 'unavailable', 'composing', 'recording', 'paused'] as const;

    if (!number || !presence) {
      res.status(400).json({ 
        success: false, 
        message: 'Campos "number" e "presence" são obrigatórios' 
      });
      return;
    }

    if (!validPresences.includes(presence as any)) {
      res.status(400).json({ 
        success: false, 
        message: `Presence deve ser um de: ${validPresences.join(', ')}` 
      });
      return;
    }

    await whatsappService.updatePresence(sanitizeNumber(number), presence as any);

    res.json({ 
      success: true, 
      message: `Presença atualizada para "${presence}"`,
      data: { number, presence, timestamp: new Date().toISOString() }
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao atualizar presença', 'updatePresence');
  }
};

/**
 * POST /api/bot/download-media
 * Baixa mídia de uma mensagem recebida
 */
export const downloadMedia = async (req: Request, res: Response): Promise<void> => {
  try {
    const { messageId, savePath } = req.body;

    if (!messageId) {
      res.status(400).json({ 
        success: false, 
        message: 'Campo "messageId" é obrigatório' 
      });
      return;
    }

    // Nota: Este endpoint requer que você tenha a mensagem completa (WAMessage)
    // Em produção, você deve buscar a mensagem do seu banco de dados ou cache
    res.status(501).json({
      success: false,
      message: 'Endpoint em desenvolvimento. Requer implementação de cache de mensagens.'
    });
    
    // Quando implementado:
    // const media = await whatsappService.downloadMedia(message, savePath);
    // res.json({ success: true, data: { path: savePath || 'buffer' } });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao baixar mídia', 'downloadMedia');
  }
};

/**
 * GET /api/bot/logs
 * Retorna logs de mensagens enviadas/recebidas (paginado)
 */
export const getMessageLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const { type, direction } = req.query;

    const filter: any = {};
    if (type) filter.type = type;
    if (direction) filter.direction = direction;

    const [logs, total] = await Promise.all([
      MessageLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      MessageLog.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error: any) {
    sendErrorResponse(res, error, 'Erro ao buscar logs de mensagens', 'getMessageLogs');
  }
};

/**
 * GET /api/bot/health
 * Health check para load balancers e monitoramento
 */
export const healthCheck = async (req: Request, res: Response): Promise<void> => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      whatsapp: {
        connected: whatsappService.getStatus(),
        connecting: whatsappService.isConnectingStatus()
      },
      uptime: process.uptime()
    };

    // Retorna 200 se conectado ou conectando, 503 se desconectado
    const statusCode = health.whatsapp.connected || health.whatsapp.connecting ? 200 : 503;
    res.status(statusCode).json({ success: true, data: health });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: 'Health check failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== MIDDLEWARE DE LOGGING (opcional) ====================

/**
 * Middleware para logar requisições ao bot
 */
export const logBotRequest = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[Bot API] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

// ==================== EXPORT DEFAULT ====================

export default {
  // Status e conexão
  getBotStatus,
  reconnectBot,
  disconnectBot,
  healthCheck,
  
  // Envio de mensagens
  sendTextMessage,
  sendImageMessage,
  sendVideoMessage,
  sendDocumentMessage,
  sendAudioMessage,
  sendContactMessage,
  sendLocationMessage,
  sendListMessage,
  sendButtonsMessage,
  
  // Gerenciamento de mensagens
  markAsRead,
  sendReaction,
  forwardMessage,
  deleteMessage,
  
  // Utilitários
  verifyNumber,
  updatePresence,
  downloadMedia,
  getMessageLogs,
  
  // Middleware
  logBotRequest
};