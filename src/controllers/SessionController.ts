// src/controllers/SessionController.ts
import { Request, Response, NextFunction } from 'express';
import { multiSessionService } from '../services/MultiSessionWhatsAppService';
import { BotSession } from '../models/BotSession';
import { Types } from 'mongoose';
import { AuthRequest } from '../types/auth';

// ==================== TIPOS E UTILITÁRIOS ====================

// Helper para extrair sessionId dos params (pode ser string ou array)
const getSessionId = (req: Request): string => {
  const { sessionId } = req.params;
  return Array.isArray(sessionId) ? sessionId[0] : sessionId;
};

// Helper para extrair userId do token JWT
const getUserId = (req: AuthRequest): string => {
  const userId = req.user?.id;
  if (!userId) {
    throw new Error('Usuário não autenticado');
  }
  return userId instanceof Types.ObjectId ? userId.toHexString() : userId.toString();
};

// Helper para resposta de erro padronizada
const sendErrorResponse = (
  res: Response,
  error: any,
  defaultMessage: string,
  context: string,
  statusCode: number = 500
): void => {
  console.error(`❌ Erro ${context}:`, error);
  
  const isNotReady = error.message?.includes('não está conectada');
  const isNotFound = error.message?.includes('não encontrada');
  const isConflict = error.message?.includes('já está ativa');
  
  const finalStatusCode = isNotReady ? 409 : isNotFound ? 404 : isConflict ? 409 : statusCode;
  
  res.status(finalStatusCode).json({
    success: false,
    message: error.message || defaultMessage,
    error: process.env.NODE_ENV === 'development' ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : undefined
  });
};

// ==================== CRUD DE SESSÕES ====================

/**
 * POST /api/sessions
 * Criar nova sessão de bot
 */
export const createSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { sessionId, name } = req.body;
    
    // Validação de entrada
    if (!sessionId || !name) {
      res.status(400).json({
        success: false,
        message: 'Campos "sessionId" e "name" são obrigatórios',
        errors: {
          sessionId: !sessionId ? 'Obrigatório' : undefined,
          name: !name ? 'Obrigatório' : undefined
        }
      });
      return;
    }
    
    // Validar formato do sessionId (alfanumérico, 4-32 chars, hífens/underscores permitidos)
    if (!/^[a-zA-Z0-9_-]{4,32}$/.test(sessionId)) {
      res.status(400).json({
        success: false,
        message: 'sessionId deve conter 4-32 caracteres alfanuméricos, hífens ou underscores'
      });
      return;
    }
    
    const sessionInfo = await multiSessionService.createSession(userId, sessionId, name);
    
    const responseMessage = sessionInfo.status === 'qr_ready' 
      ? 'QR Code gerado. Escaneie para conectar.' 
      : 'Sessão criada. Conexão em andamento.';
    
    res.status(201).json({
      success: true,
      data: sessionInfo,
      message: responseMessage
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao criar sessão', 'createSession', 400);
  }
};

/**
 * GET /api/sessions
 * Listar sessões do usuário
 */
export const listSessions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const { status } = req.query;
    
    // Validar status se fornecido
    const validStatuses = ['disconnected', 'qr_ready', 'connecting', 'connected', 'error'] as const;
    const statusFilter = status && validStatuses.includes(status as any) 
      ? status as typeof validStatuses[number] 
      : undefined;
    
    const sessions = await multiSessionService.listSessions(userId, statusFilter);
    
    res.json({
      success: true,
      data: {
        sessions,
        total: sessions.length,
        filteredBy: statusFilter || 'all'
      }
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao listar sessões', 'listSessions');
  }
};

/**
 * GET /api/sessions/:sessionId
 * Obter detalhes de uma sessão
 */
export const getSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);
    
    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Parâmetro "sessionId" é obrigatório na URL'
      });
      return;
    }
    
    const sessionInfo = await multiSessionService.getSessionInfo(sessionId, userId);
    
    res.json({
      success: true,
      data: sessionInfo
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Sessão não encontrada', 'getSession', 404);
  }
};

/**
 * POST /api/sessions/:sessionId/disconnect
 * Desconectar sessão
 */
export const disconnectSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);
    
    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Parâmetro "sessionId" é obrigatório na URL'
      });
      return;
    }
    
    await multiSessionService.disconnectSession(sessionId, userId);
    
    res.json({
      success: true,
      message: 'Sessão desconectada com sucesso',
      data: { sessionId, status: 'disconnected' }
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao desconectar sessão', 'disconnectSession');
  }
};

/**
 * DELETE /api/sessions/:sessionId
 * Deletar sessão permanentemente
 */
export const deleteSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);
    
    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Parâmetro "sessionId" é obrigatório na URL'
      });
      return;
    }
    
    await multiSessionService.deleteSession(sessionId, userId);
    
    res.json({
      success: true,
      message: 'Sessão deletada permanentemente',
      data: { sessionId, deleted: true }
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao deletar sessão', 'deleteSession');
  }
};

// ==================== OPERAÇÕES POR SESSÃO ====================

/**
 * POST /api/sessions/:sessionId/send-text
 * Enviar mensagem de texto por uma sessão específica
 */
export const sendSessionMessage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);
    const { number, message } = req.body;
    
    // Validações
    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Parâmetro "sessionId" é obrigatório na URL'
      });
      return;
    }
    
    if (!number || !message) {
      res.status(400).json({
        success: false,
        message: 'Campos "number" e "message" são obrigatórios',
        errors: {
          number: !number ? 'Obrigatório' : undefined,
          message: !message ? 'Obrigatório' : undefined
        }
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
    
    const result = await multiSessionService.sendMessage(
      sessionId,
      userId,
      number,
      message
    );
    
    res.json({
      success: true,
      data: result,
      message: 'Mensagem enviada com sucesso'
    });
    
  } catch (error: any) {
    const isNotConnected = error.message?.includes('não está conectada');
    sendErrorResponse(
      res, 
      error, 
      isNotConnected ? 'Sessão não está conectada' : 'Falha ao enviar mensagem',
      'sendSessionMessage',
      isNotConnected ? 409 : 500
    );
  }
};

/**
 * PATCH /api/sessions/:sessionId/settings
 * Atualizar configurações da sessão
 */
export const updateSessionSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);
    const { webhookUrl, autoReply, readMessages, downloadMedia } = req.body;
    
    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Parâmetro "sessionId" é obrigatório na URL'
      });
      return;
    }
    
    // Validar webhookUrl se fornecido
    if (webhookUrl !== undefined && webhookUrl !== null) {
      try {
        new URL(webhookUrl); // Valida se é URL válida
      } catch {
        res.status(400).json({
          success: false,
          message: 'webhookUrl deve ser uma URL válida'
        });
        return;
      }
    }
    
    // Construir objeto de update
    const update: Record<string, any> = {};
    if (webhookUrl !== undefined) update.webhookUrl = webhookUrl;
    if (autoReply !== undefined) update['settings.autoReply'] = autoReply;
    if (readMessages !== undefined) update['settings.readMessages'] = readMessages;
    if (downloadMedia !== undefined) update['settings.downloadMedia'] = downloadMedia;
    
    // Se nada para atualizar
    if (Object.keys(update).length === 0) {
      res.status(400).json({
        success: false,
        message: 'Nenhum campo válido para atualização'
      });
      return;
    }
    
    const updated = await BotSession.findOneAndUpdate(
      { sessionId, userId },
      { $set: update },
      { new: true, runValidators: true }
    ).select('-creds -keys');
    
    if (!updated) {
      res.status(404).json({
        success: false,
        message: 'Sessão não encontrada'
      });
      return;
    }
    
    res.json({
      success: true,
      data: updated,
      message: 'Configurações atualizadas com sucesso'
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao atualizar configurações', 'updateSessionSettings');
  }
};

// ==================== UTILITÁRIOS ====================

/**
 * GET /api/sessions/:sessionId/qr
 * Obter QR Code atual da sessão (se disponível)
 */
export const getSessionQR = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);
    
    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Parâmetro "sessionId" é obrigatório na URL'
      });
      return;
    }
    
    const session = await BotSession.findOne({ sessionId, userId }).select('qrCode status');
    
    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Sessão não encontrada'
      });
      return;
    }
    
    if (session.status !== 'qr_ready' || !session.qrCode) {
      res.status(404).json({
        success: false,
        message: 'QR Code não disponível. A sessão pode estar conectada ou desconectada.'
      });
      return;
    }
    
    res.json({
      success: true,
      data: {
        qrCode: session.qrCode,
        expiresAt: new Date(Date.now() + 60000).toISOString() // QR expira em 60s
      }
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao obter QR Code', 'getSessionQR');
  }
};

/**
 * POST /api/sessions/:sessionId/reconnect
 * Forçar reconexão manual de uma sessão
 */
export const reconnectSession = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = getUserId(req);
    const sessionId = getSessionId(req);
    
    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: 'Parâmetro "sessionId" é obrigatório na URL'
      });
      return;
    }
    
    // Verificar se já está conectando
    const session = await BotSession.findOne({ sessionId, userId });
    if (session?.status === 'connecting') {
      res.status(409).json({
        success: false,
        message: 'Reconexão já em andamento'
      });
      return;
    }
    
    // Iniciar reconexão via service
    await multiSessionService.createSession(userId, sessionId, session?.name || 'Bot');
    
    res.json({
      success: true,
      message: 'Reconexão iniciada. Aguarde o QR Code ou confirmação de conexão.',
      data: { sessionId, status: 'connecting' }
    });
    
  } catch (error: any) {
    sendErrorResponse(res, error, 'Falha ao iniciar reconexão', 'reconnectSession');
  }
};

// ==================== EXPORT DEFAULT ====================

export default {
  // CRUD
  createSession,
  listSessions,
  getSession,
  disconnectSession,
  deleteSession,
  
  // Operações
  sendSessionMessage,
  updateSessionSettings,
  
  // Utilitários
  getSessionQR,
  reconnectSession
};