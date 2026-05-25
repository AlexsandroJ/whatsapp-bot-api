// src/__tests__/bot.test.ts
/// <reference types="jest" />

import request from 'supertest';
import app from '../server';
import { whatsappService } from '../services/WhatsAppService';

// Mock do WhatsAppService para isolar testes do controller
jest.mock('../services/WhatsAppService', () => ({
  whatsappService: {
    getStatus: jest.fn(),
    isConnectingStatus: jest.fn(),
    sendMessage: jest.fn(),
    getClient: jest.fn(),
    reconnect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }
}));

describe('Bot API', () => {
  let token: string;

  beforeAll(async () => {
    // Registrar e logar usuário para obter token
    await request(app).post('/api/auth/register').send({
      username: 'test_bot_user',
      password: 'password123'
    });
    
    const login = await request(app).post('/api/auth/login').send({
      username: 'test_bot_user',
      password: 'password123'
    });
    token = login.body.token;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== TESTES DE STATUS ====================

  describe('GET /api/bot/status', () => {
    it('✅ Deve retornar status do bot', async () => {
      // Mock do getStatus retornando true
      (whatsappService.getStatus as jest.Mock).mockReturnValue(true);
      (whatsappService.isConnectingStatus as jest.Mock).mockReturnValue(false);
      (whatsappService.getClient as jest.Mock).mockReturnValue({});
      
      const res = await request(app)
        .get('/api/bot/status')
        .set('Authorization', `Bearer ${token}`);
      
      // ✅ CORREÇÃO 1: Resposta tem estrutura { success: true, data: {...} }
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connected).toBe(true); // ← Acessar via data.connected
      expect(res.body.data.connecting).toBe(false);
      
      // Verifica se o mock foi chamado
      expect(whatsappService.getStatus).toHaveBeenCalled();
    });
  });

  // ==================== TESTES DE ENVIO DE TEXTO ====================

  describe('POST /api/bot/send-text', () => {
    const messageData = {
      number: '5511999999999',
      message: 'Olá teste!'
    };

    it('✅ Deve enviar mensagem de texto', async () => {
      // Mock do sendMessage retornando sucesso
      (whatsappService.sendMessage as jest.Mock).mockResolvedValue({
        id: 'msg_test_123',
        status: 'sent',
        timestamp: Date.now()
      });
      
      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send(messageData);
      
      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('msg_test_123');
      
      // ✅ CORREÇÃO 2: sendMessage recebe (jid: string, content: string, options?)
      // O segundo argumento é a STRING direta, não { text: ... }
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining(messageData.number), // JID normalizado
        messageData.message,                          // ← String direta, não objeto
        undefined                                     // options (sem quoted)
      );
    });

    it('Não deve enviar mensagem sem autenticação', async () => {
      const res = await request(app)
        .post('/api/bot/send-text')
        .send(messageData);
      
      expect(res.statusCode).toEqual(401);
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('Não deve enviar mensagem se número ou texto faltarem', async () => {
      // Teste sem número
      const res1 = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: 'Sem número' });
      
      expect(res1.statusCode).toEqual(400);
      
      // Teste sem mensagem
      const res2 = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: '5511999999999' });
      
      expect(res2.statusCode).toEqual(400);
      
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('Deve enviar mensagem com quoted', async () => {
      const quotedMsg = { key: { id: 'original_msg_456' } };
      
      (whatsappService.sendMessage as jest.Mock).mockResolvedValue({
        id: 'msg_quoted_789',
        status: 'sent',
        timestamp: Date.now()
      });
      
      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: '5511999999999',
          message: 'Resposta',
          quoted: quotedMsg
        });
      
      expect(res.statusCode).toEqual(200);
      
      // ✅ Verifica que options com quoted foi passado
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('5511999999999'),
        'Resposta',
        { quoted: quotedMsg } // ← Third argument com quoted
      );
    });

    it('Deve retornar 503 se WhatsApp não estiver pronto', async () => {
      // Mock para simular erro de conexão
      (whatsappService.sendMessage as jest.Mock).mockRejectedValue(
        new Error('Cliente WhatsApp não está pronto')
      );
      
      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send(messageData);
      
      expect(res.statusCode).toEqual(503); // Service Unavailable
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('não está pronto');
    });
  });
});