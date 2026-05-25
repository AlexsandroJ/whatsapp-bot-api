// src/__tests__/controllers/BotController.test.ts
/// <reference types="jest" />

import request from 'supertest';
import app from '../../server';
import { whatsappService } from '../../services/WhatsAppService';
import MessageLog from '../../models/MessageLog';

// Mock dos serviços externos
jest.mock('../../services/WhatsAppService', () => ({
  whatsappService: {
    getStatus: jest.fn(),
    isConnectingStatus: jest.fn(),
    getClient: jest.fn(),
    sendMessage: jest.fn(),
    sendImage: jest.fn(),
    sendVideo: jest.fn(),
    sendDocument: jest.fn(),
    sendAudio: jest.fn(),
    sendContact: jest.fn(),
    sendLocation: jest.fn(),
    sendList: jest.fn(),
    sendButtons: jest.fn(),
    markAsRead: jest.fn(),
    sendReaction: jest.fn(),
    forwardMessage: jest.fn(),
    deleteMessage: jest.fn(),
    verifyNumber: jest.fn(),
    updatePresence: jest.fn(),
    downloadMedia: jest.fn(),
    reconnect: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
    off: jest.fn()
  }
}));

// Mock do MessageLog para evitar conexão real com MongoDB nos testes de controller
jest.mock('../../models/MessageLog', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'log_123', save: jest.fn() }),
  find: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([]),
  countDocuments: jest.fn().mockResolvedValue(0)
}));

describe('BotController - API Completa', () => {
  let token: string;
  const testNumber = '5511999999999';
  const testMessage = 'Mensagem de teste';

  beforeAll(async () => {
    // Registrar e logar usuário para obter token
    await request(app).post('/api/auth/register').send({
      username: 'test_bot_api',
      password: 'password123'
    });

    const login = await request(app).post('/api/auth/login').send({
      username: 'test_bot_api',
      password: 'password123'
    });
    token = login.body.token;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== STATUS E CONEXÃO ====================

  describe('GET /api/bot/status', () => {
    it('Deve retornar status do bot conectado', async () => {
      (whatsappService.getStatus as jest.Mock).mockReturnValue(true);
      (whatsappService.isConnectingStatus as jest.Mock).mockReturnValue(false);
      (whatsappService.getClient as jest.Mock).mockReturnValue({});

      const res = await request(app)
        .get('/api/bot/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        connected: true,
        connecting: false,
        client: 'active',
        timestamp: expect.any(String)
      });
    });

    it('Deve retornar status do bot desconectado', async () => {
      (whatsappService.getStatus as jest.Mock).mockReturnValue(false);
      (whatsappService.getClient as jest.Mock).mockReturnValue(null);

      const res = await request(app)
        .get('/api/bot/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.connected).toBe(false);
      expect(res.body.data.client).toBe('inactive');
    });

    it('Deve retornar 500 em caso de erro interno', async () => {
      // Simular erro inesperado
      const originalGetStatus = whatsappService.getStatus;
      (whatsappService as any).getStatus = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const res = await request(app)
        .get('/api/bot/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(500);
      expect(res.body.success).toBe(false);

      // Restaurar
      (whatsappService as any).getStatus = originalGetStatus;
    });
  });

  describe('POST /api/bot/reconnect', () => {
    it('Deve reconectar o bot com sucesso', async () => {
      (whatsappService.isConnectingStatus as jest.Mock).mockReturnValue(false);
      (whatsappService.reconnect as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/bot/reconnect')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(whatsappService.reconnect).toHaveBeenCalled();
    });

    it('Deve retornar 409 se reconexão já estiver em andamento', async () => {
      (whatsappService.isConnectingStatus as jest.Mock).mockReturnValue(true);

      const res = await request(app)
        .post('/api/bot/reconnect')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(409);
      expect(res.body.message).toContain('já em andamento');
      expect(whatsappService.reconnect).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/bot/disconnect', () => {
    it('Deve desconectar o bot com sucesso', async () => {
      (whatsappService.disconnect as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/bot/disconnect')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(whatsappService.disconnect).toHaveBeenCalled();
    });
  });

  // Substitua os testes de GET /api/bot/health por:

  describe('GET /api/bot/health', () => {
    it('Deve retornar health check com status ok quando conectado', async () => {
      (whatsappService.getStatus as jest.Mock).mockReturnValue(true);
      (whatsappService.isConnectingStatus as jest.Mock).mockReturnValue(false);

      // ✅ NÃO enviar token - health check é público
      const res = await request(app).get('/api/bot/health');

      expect(res.statusCode).toBe(200);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.whatsapp.connected).toBe(true);
      expect(res.body.data.uptime).toBeDefined();
    });

    it('Deve retornar 503 quando bot estiver desconectado', async () => {
      (whatsappService.getStatus as jest.Mock).mockReturnValue(false);
      (whatsappService.isConnectingStatus as jest.Mock).mockReturnValue(false);

      // ✅ NÃO enviar token - health check é público
      const res = await request(app).get('/api/bot/health');

      expect(res.statusCode).toBe(503);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.whatsapp.connected).toBe(false);
    });

    it('Deve funcionar mesmo sem autenticação', async () => {
      // Teste explícito para garantir que health check é público
      const res = await request(app).get('/api/bot/health');

      expect(res.statusCode).not.toBe(401); // Não deve exigir auth
    });
  });

  // ==================== ENVIO DE MENSAGENS DE TEXTO ====================

  describe('POST /api/bot/send-text', () => {
    it('Deve enviar mensagem de texto com sucesso', async () => {
      (whatsappService.sendMessage as jest.Mock).mockResolvedValue({
        id: 'msg_123', status: 'sent', timestamp: Date.now()
      });
      (MessageLog.create as jest.Mock).mockResolvedValue({ _id: 'log_123' });

      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, message: testMessage });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('msg_123');
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        testNumber, testMessage, undefined
      );
      expect(MessageLog.create).toHaveBeenCalled();
    });

    it('Deve enviar mensagem com quoted', async () => {
      (whatsappService.sendMessage as jest.Mock).mockResolvedValue({
        id: 'msg_456', status: 'sent', timestamp: Date.now()
      });

      const quoted = { key: { id: 'original_123' } };

      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, message: testMessage, quoted });

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        testNumber, testMessage, { quoted }
      );
    });

    it('Deve retornar 400 se número estiver faltando', async () => {
      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: testMessage });

      expect(res.statusCode).toBe(400);
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });

    it('Deve retornar 400 se mensagem estiver vazia', async () => {
      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, message: '   ' });

      expect(res.statusCode).toBe(400);
    });

    it('Deve retornar 503 se WhatsApp não estiver pronto', async () => {
      (whatsappService.sendMessage as jest.Mock).mockRejectedValue(
        new Error('Cliente WhatsApp não está pronto')
      );

      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, message: testMessage });

      expect(res.statusCode).toBe(503);
      expect(res.body.message).toContain('não está pronto');
    });
  });

  // ==================== ENVIO DE MÍDIA ====================

  describe('POST /api/bot/send-image', () => {
    it('Deve enviar imagem com sucesso', async () => {
      (whatsappService.sendImage as jest.Mock).mockResolvedValue({
        id: 'img_123', status: 'sent', timestamp: Date.now()
      });

      const res = await request(app)
        .post('/api/bot/send-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          media: 'https://example.com/image.jpg',
          mimetype: 'image/jpeg',
          caption: 'Minha foto'
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendImage).toHaveBeenCalledWith(
        testNumber,
        expect.objectContaining({
          media: 'https://example.com/image.jpg',
          mimetype: 'image/jpeg',
          caption: 'Minha foto'
        })
      );
    });

    it('Deve retornar 400 se mimetype estiver faltando', async () => {
      const res = await request(app)
        .post('/api/bot/send-image')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, media: 'data:image/jpeg;base64,...' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/bot/send-video', () => {
    beforeEach(() => {
      (whatsappService.sendVideo as jest.Mock).mockResolvedValue({
        id: 'vid_123', status: 'sent', timestamp: Date.now()
      });
    });

    it('Deve enviar vídeo normal com sucesso', async () => {
      const res = await request(app)
        .post('/api/bot/send-video')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          media: 'https://example.com/video.mp4',
          mimetype: 'video/mp4',
          caption: 'Meu vídeo'
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('vid_123');

      // ✅ CORREÇÃO: Esperar apenas o que o controller passa (sem gifPlayback)
      expect(whatsappService.sendVideo).toHaveBeenCalledWith(
        testNumber,
        expect.objectContaining({
          media: 'https://example.com/video.mp4',
          mimetype: 'video/mp4',
          caption: 'Meu vídeo',
          filename: undefined
        })
      );
    });

    it('Deve enviar GIF com mimetype image/gif', async () => {
      const res = await request(app)
        .post('/api/bot/send-video')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          media: 'https://example.com/anim.gif',
          mimetype: 'image/gif',
          caption: 'Animado!'
        });

      expect(res.statusCode).toBe(200);

      // ✅ CORREÇÃO: O controller passa mimetype, o serviço calcula gifPlayback
      expect(whatsappService.sendVideo).toHaveBeenCalledWith(
        testNumber,
        expect.objectContaining({
          media: 'https://example.com/anim.gif',
          mimetype: 'image/gif',  // ← O controller passa o mimetype
          caption: 'Animado!',
          filename: undefined
        })
      );

      // Nota: gifPlayback é adicionado DENTRO do WhatsAppService.sendVideo,
      // então não aparece aqui porque estamos mockando o serviço.
    });
  });

  describe('POST /api/bot/send-document', () => {
    it('Deve enviar documento com filename personalizado', async () => {
      (whatsappService.sendDocument as jest.Mock).mockResolvedValue({
        id: 'doc_123', status: 'sent', timestamp: Date.now()
      });

      const res = await request(app)
        .post('/api/bot/send-document')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          media: 'https://example.com/file.pdf',
          mimetype: 'application/pdf',
          filename: 'relatorio.pdf',
          caption: 'Relatório mensal'
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendDocument).toHaveBeenCalledWith(
        testNumber,
        expect.objectContaining({
          filename: 'relatorio.pdf',
          caption: 'Relatório mensal'
        })
      );
    });

    it('Deve usar filename padrão "document" se não fornecido', async () => {
      (whatsappService.sendDocument as jest.Mock).mockResolvedValue({
        id: 'doc_456', status: 'sent', timestamp: Date.now()
      });

      await request(app)
        .post('/api/bot/send-document')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          media: Buffer.from('fake-pdf'),
          mimetype: 'application/pdf'
        });

      expect(whatsappService.sendDocument).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ filename: 'document' })
      );
    });
  });

  describe('POST /api/bot/send-audio', () => {
    it('Deve enviar áudio normal', async () => {
      (whatsappService.sendAudio as jest.Mock).mockResolvedValue({
        id: 'aud_123', status: 'sent', timestamp: Date.now()
      });

      const res = await request(app)
        .post('/api/bot/send-audio')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          media: 'https://example.com/audio.ogg',
          mimetype: 'audio/ogg; codecs=opus'
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendAudio).toHaveBeenCalledWith(
        testNumber,
        expect.objectContaining({ ptt: undefined })
      );
    });

    it('Deve enviar nota de voz (PTT)', async () => {
      (whatsappService.sendAudio as jest.Mock).mockResolvedValue({
        id: 'ptt_123', status: 'sent', timestamp: Date.now()
      });

      await request(app)
        .post('/api/bot/send-audio')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          media: Buffer.from('ogg-data'),
          mimetype: 'audio/ogg; codecs=opus',
          ptt: true
        });

      expect(whatsappService.sendAudio).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ptt: true })
      );
    });
  });

  // ==================== MENSAGENS ESPECIAIS ====================

  describe('POST /api/bot/send-contact', () => {
    it('Deve enviar contato com sucesso', async () => {
      (whatsappService.sendContact as jest.Mock).mockResolvedValue({
        id: 'contact_123', status: 'sent', timestamp: Date.now()
      });

      const res = await request(app)
        .post('/api/bot/send-contact')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          contact: { name: 'João Silva', phone: '5511987654321' }
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendContact).toHaveBeenCalledWith(
        testNumber,
        { name: 'João Silva', number: '5511987654321' }
      );
    });

    it('Deve retornar 400 se dados do contato estiverem incompletos', async () => {
      const res = await request(app)
        .post('/api/bot/send-contact')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, contact: { name: 'João' } }); // sem phone

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/bot/send-location', () => {
    it('Deve enviar localização com nome', async () => {
      (whatsappService.sendLocation as jest.Mock).mockResolvedValue({
        id: 'loc_123', status: 'sent', timestamp: Date.now()
      });

      const res = await request(app)
        .post('/api/bot/send-location')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          latitude: -23.5505,
          longitude: -46.6333,
          name: 'São Paulo, SP'
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendLocation).toHaveBeenCalledWith(
        testNumber,
        expect.objectContaining({ name: 'São Paulo, SP' })
      );
    });

    it('Deve retornar 400 se latitude não for número', async () => {
      const res = await request(app)
        .post('/api/bot/send-location')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          latitude: 'invalido',
          longitude: -46.6333
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/bot/send-list', () => {
    it('Deve enviar lista interativa com sucesso', async () => {
      (whatsappService.sendList as jest.Mock).mockResolvedValue({
        id: 'list_123', status: 'sent', timestamp: Date.now()
      });

      const sections = [{
        title: 'Opções',
        rows: [
          { title: 'Opção 1', description: 'Desc 1', id: 'opt_1' },
          { title: 'Opção 2', description: 'Desc 2', id: 'opt_2' }
        ]
      }];

      const res = await request(app)
        .post('/api/bot/send-list')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          title: 'Menu',
          description: 'Escolha uma opção',
          buttonText: 'Ver',
          sections
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendList).toHaveBeenCalledWith(
        testNumber, 'Menu', 'Escolha uma opção', 'Ver', sections
      );
    });

    it('Deve retornar 400 se sections não for array', async () => {
      const res = await request(app)
        .post('/api/bot/send-list')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          title: 'Menu',
          description: 'Teste',
          buttonText: 'Ver',
          sections: 'not-an-array'
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/bot/send-buttons', () => {
    it('Deve enviar botões com sucesso', async () => {
      (whatsappService.sendButtons as jest.Mock).mockResolvedValue({
        id: 'btn_123', status: 'sent', timestamp: Date.now()
      });

      const buttons = [
        { id: 'yes', text: 'Sim' },
        { id: 'no', text: 'Não' }
      ];

      const res = await request(app)
        .post('/api/bot/send-buttons')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          text: 'Confirmar?',
          buttons
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendButtons).toHaveBeenCalledWith(
        testNumber, 'Confirmar?', buttons
      );
    });

    it('Deve retornar 400 se buttons estiver vazio', async () => {
      const res = await request(app)
        .post('/api/bot/send-buttons')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          text: 'Teste',
          buttons: []
        });

      expect(res.statusCode).toBe(400);
    });
  });

  // ==================== GERENCIAMENTO DE MENSAGENS ====================

  describe('POST /api/bot/mark-as-read', () => {
    it('Deve marcar mensagens como lidas', async () => {
      (whatsappService.markAsRead as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/bot/mark-as-read')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          messageIds: ['msg_1', 'msg_2', 'msg_3']
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.markAsRead).toHaveBeenCalledWith(
        testNumber, ['msg_1', 'msg_2', 'msg_3']
      );
    });

    it('Deve retornar 400 se messageIds não for array', async () => {
      const res = await request(app)
        .post('/api/bot/mark-as-read')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, messageIds: 'not-array' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/bot/send-reaction', () => {
    it('Deve reagir a mensagem com emoji', async () => {
      (whatsappService.sendReaction as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/bot/send-reaction')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          messageId: 'msg_abc123',
          reaction: '👍'
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.sendReaction).toHaveBeenCalledWith(
        testNumber, 'msg_abc123', '👍'
      );
    });

    it('Deve retornar 400 se reaction estiver faltando', async () => {
      const res = await request(app)
        .post('/api/bot/send-reaction')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, messageId: 'msg_123' });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/bot/forward-message', () => {
    it('Deve encaminhar mensagem com sucesso', async () => {
      (whatsappService.forwardMessage as jest.Mock).mockResolvedValue({
        id: 'fwd_123', status: 'sent', timestamp: Date.now()
      });

      const originalMsg = { key: { id: 'orig_456', remoteJid: '5511000000000@s.whatsapp.net' } };

      const res = await request(app)
        .post('/api/bot/forward-message')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          message: originalMsg
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.forwardMessage).toHaveBeenCalledWith(
        testNumber, originalMsg, { forceForward: undefined }
      );
    });

    it('Deve encaminhar com forceForward=true', async () => {
      (whatsappService.forwardMessage as jest.Mock).mockResolvedValue({
        id: 'fwd_789', status: 'sent', timestamp: Date.now()
      });

      await request(app)
        .post('/api/bot/forward-message')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          message: { key: { id: 'orig_123' } },
          forceForward: true
        });

      expect(whatsappService.forwardMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        { forceForward: true }
      );
    });
  });

  describe('DELETE /api/bot/delete-message', () => {
    it('Deve deletar mensagem apenas para mim', async () => {
      (whatsappService.deleteMessage as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/bot/delete-message')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          messageId: 'msg_to_delete',
          onlyForMe: true
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.deleteMessage).toHaveBeenCalledWith(
        testNumber, 'msg_to_delete', true
      );
      expect(res.body.message).toContain('apenas para você');
    });

    it('Deve deletar mensagem para todos', async () => {
      (whatsappService.deleteMessage as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/bot/delete-message')
        .set('Authorization', `Bearer ${token}`)
        .send({
          number: testNumber,
          messageId: 'msg_to_delete',
          onlyForMe: false
        });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.deleteMessage).toHaveBeenCalledWith(
        testNumber, 'msg_to_delete', false
      );
      expect(res.body.message).toContain('para todos');
    });
  });

  // ==================== UTILITÁRIOS ====================

  describe('POST /api/bot/verify-number', () => {
    it('Deve verificar número existente', async () => {
      (whatsappService.verifyNumber as jest.Mock).mockResolvedValue({
        exists: true,
        jid: '5511999999999@s.whatsapp.net'
      });

      const res = await request(app)
        .post('/api/bot/verify-number')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.exists).toBe(true);
      expect(res.body.data.jid).toBe('5511999999999@s.whatsapp.net');
    });

    it('Deve retornar exists=false para número inexistente', async () => {
      (whatsappService.verifyNumber as jest.Mock).mockResolvedValue({
        exists: false
      });

      const res = await request(app)
        .post('/api/bot/verify-number')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: '5511000000000' });

      expect(res.statusCode).toBe(200);
      expect(res.body.data.exists).toBe(false);
    });
  });

  describe('POST /api/bot/update-presence', () => {
    it.each([
      ['available'],
      ['unavailable'],
      ['composing'],
      ['recording'],
      ['paused']
    ])('Deve atualizar presença para "%s"', async (presence) => {
      (whatsappService.updatePresence as jest.Mock).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/bot/update-presence')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, presence });

      expect(res.statusCode).toBe(200);
      expect(whatsappService.updatePresence).toHaveBeenCalledWith(
        testNumber, presence
      );
    });

    it('Deve retornar 400 para presença inválida', async () => {
      const res = await request(app)
        .post('/api/bot/update-presence')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: testNumber, presence: 'invalid' });

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toContain('deve ser um de');
    });
  });

  describe('POST /api/bot/download-media', () => {
    it('Deve retornar 501 (Not Implemented) pois requer cache de mensagens', async () => {
      // ✅ Enviar token pois esta rota é protegida
      const res = await request(app)
        .post('/api/bot/download-media')
        .set('Authorization', `Bearer ${token}`)  // ← Adicionar token
        .send({ messageId: 'msg_123' });

      expect(res.statusCode).toBe(501);  // ← Esperar 501, não 404
      expect(res.body.message).toContain('em desenvolvimento');
    });

    it('Deve retornar 400 se messageId estiver faltando', async () => {
      const res = await request(app)
        .post('/api/bot/download-media')
        .set('Authorization', `Bearer ${token}`)  // ← Adicionar token
        .send({});

      expect(res.statusCode).toBe(400);  // ← Validação acontece antes de verificar implementação
    });
  });

  describe('GET /api/bot/logs', () => {
    it('Deve retornar logs paginados com filtros', async () => {
      const mockLogs = [
        { _id: 'log_1', type: 'text', direction: 'outbound', content: 'Olá' },
        { _id: 'log_2', type: 'image', direction: 'inbound', content: '[Imagem]' }
      ];

      (MessageLog.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockLogs)
      });
      (MessageLog.countDocuments as jest.Mock).mockResolvedValue(2);

      const res = await request(app)
        .get('/api/bot/logs?page=1&limit=10&type=text')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.logs).toHaveLength(2);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        pages: 1,
        hasNext: false,
        hasPrev: false
      });
    });

    it('Deve usar valores padrão para paginação', async () => {
      (MessageLog.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([])
      });
      (MessageLog.countDocuments as jest.Mock).mockResolvedValue(0);

      const res = await request(app)
        .get('/api/bot/logs')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(20); // default
    });
  });

  // ==================== AUTENTICAÇÃO ====================

  describe('Proteção de Rotas', () => {
    it('Deve retornar 401 para rota sem token', async () => {
      const res = await request(app)
        .get('/api/bot/status');

      expect(res.statusCode).toBe(401);
    });

    it('Deve retornar 401 para token inválido', async () => {
      const res = await request(app)
        .get('/api/bot/status')
        .set('Authorization', 'Bearer invalid_token_xyz');

      expect(res.statusCode).toBe(401);
    });

    it('Deve permitir acesso com token válido', async () => {
      (whatsappService.getStatus as jest.Mock).mockReturnValue(true);

      const res = await request(app)
        .get('/api/bot/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
    });
  });

  // ==================== SANITIZAÇÃO DE NÚMERO ====================

  describe('Sanitização de Número de Telefone', () => {
    it('Deve sanitizar número com caracteres especiais', async () => {
      (whatsappService.sendMessage as jest.Mock).mockResolvedValue({
        id: 'msg_sanitized', status: 'sent', timestamp: Date.now()
      });

      await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: '+55 (11) 99999-9999', message: 'Teste' });

      // Verifica que o número foi sanitizado antes de passar para o serviço
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        '5511999999999', // Número limpo
        'Teste',
        undefined
      );
    });

    it('Deve manter número já sanitizado', async () => {
      (whatsappService.sendMessage as jest.Mock).mockResolvedValue({
        id: 'msg_clean', status: 'sent', timestamp: Date.now()
      });

      await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: '5511999999999', message: 'Teste' });

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        '5511999999999',
        'Teste',
        undefined
      );
    });
  });
});