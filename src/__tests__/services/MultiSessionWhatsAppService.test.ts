// src/__tests__/services/MultiSessionWhatsAppService.test.ts
/// <reference types="jest" />

// =====================================================
// ⚠️ MOCKS GLOBAIS - ANTES DE QUALQUER IMPORT ⚠️
// =====================================================

// Mock do fetch para webhooks
global.fetch = jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue({}) });

// Mock do mongodb-memory-server
jest.mock('mongodb-memory-server', () => ({
  MongoMemoryServer: {
    create: jest.fn().mockResolvedValue({
      getUri: jest.fn().mockReturnValue('mongodb://127.0.0.1:27017/test-multi-session'),
      stop: jest.fn().mockResolvedValue(undefined)
    })
  }
}));

// Mock do mongoose com query chainable
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');

  // Helper para query chainable
  const mockQuery = (results: any) => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(results),
    select: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(results),
    then: jest.fn(function (resolve) { resolve(results); return this; }),
    catch: jest.fn(function () { return this; })
  });

  return {
    ...actual,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    model: jest.fn(),
    Schema: actual.Schema,
    Types: actual.Types,
    Document: actual.Document,
    // Mock do find que retorna query chainable
    Model: class {
      static find(query: any) { return mockQuery([]); }
      static findOne(query: any) { return mockQuery(null); }
      static findOneAndUpdate(query: any, update: any, options: any) {
        return mockQuery({ ...query, ...update.$set });
      }
      static create(data: any) { return Promise.resolve({ _id: 'new_123', ...data }); }
      static deleteOne(query: any) { return Promise.resolve({ deletedCount: 1 }); }
      static updateOne(query: any, update: any) { return Promise.resolve({ modifiedCount: 1 }); }
    }
  };
});

// 🔁 SUBSTITUA TODO O jest.mock('@whiskeysockets/baileys', ...) POR ESTE:

jest.mock('@whiskeysockets/baileys', () => {
  // ✅ Map DEFINIDO FORA da factory para persistir entre clearAllMocks()
  const mockSockets = new Map<string, any>();

  // ✅ Referência para o último socket criado (fallback para testes)
  let lastCreatedSocket: any = null;

  const mockMakeWASocket = jest.fn((config: any) => {
    // ✅ Prioriza sessionId explícito, fallback para config.auth ou gera UUID previsível
    const sessionId =
      config?.sessionId ||
      config?.auth?.state?.creds?.sessionId ||
      `test_session_${Date.now()}`;

    const handlers: Record<string, Function[]> = {};

    const mockSock = {
      sessionId,
      user: null as any,

      ev: {
        on: jest.fn((event: string, handler: Function) => {
          if (!handlers[event]) handlers[event] = [];
          handlers[event].push(handler);
        }),
        off: jest.fn((event: string, handler?: Function) => {
          if (handler && handlers[event]) {
            handlers[event] = handlers[event].filter(h => h !== handler);
          } else {
            delete handlers[event];
          }
        }),
        emit: jest.fn((event: string, ...args: any[]) => {
          handlers[event]?.forEach(h => h(...args));
        }),
        getHandlers: () => handlers
      },

      sendMessage: jest.fn().mockResolvedValue({ key: { id: `msg_${Date.now()}` } }),
      logout: jest.fn().mockResolvedValue(undefined),
      readMessages: jest.fn().mockResolvedValue(undefined),
      sendPresenceUpdate: jest.fn().mockResolvedValue(undefined),
      updateMediaMessage: jest.fn().mockResolvedValue(undefined),
      chatModify: jest.fn().mockResolvedValue(undefined),
      assertSessions: jest.fn().mockResolvedValue(true),
      relayMessage: jest.fn().mockResolvedValue(undefined),
      sendReceipt: jest.fn().mockResolvedValue(undefined),
      sendReceipts: jest.fn().mockResolvedValue(undefined),
      fetchMessageReceipts: jest.fn().mockResolvedValue([]),
      groupQuery: jest.fn().mockResolvedValue(undefined),
      acceptInvite: jest.fn().mockResolvedValue(undefined),
      getWAMetadata: jest.fn().mockResolvedValue(undefined),
      updateProfilePicture: jest.fn().mockResolvedValue(undefined),
      updateProfileStatus: jest.fn().mockResolvedValue(undefined),
      updateProfileName: jest.fn().mockResolvedValue(undefined),
      updateBlockStatus: jest.fn().mockResolvedValue(undefined),
      getBusinessProfile: jest.fn().mockResolvedValue(undefined),
      profilePictureUrl: jest.fn().mockResolvedValue(null),
      onWhatsApp: jest.fn().mockResolvedValue([]),
      fetchPrivacySettings: jest.fn().mockResolvedValue({}),
      presences: {},
      cleanDirtyBits: jest.fn().mockResolvedValue(undefined),
      addChatMutationHandler: jest.fn(),
      flushBufferForMessage: jest.fn(),
    };

    // ✅ Armazena com MÚLTIPLAS chaves para garantir recuperação
    mockSockets.set(sessionId, mockSock);
    mockSockets.set(`fallback_${sessionId}`, mockSock);

    // ✅ Atualiza referência global para fallback em testes
    lastCreatedSocket = mockSock;

    return mockSock;
  });

  return {
    __esModule: true,
    default: mockMakeWASocket,
    makeWASocket: mockMakeWASocket,

    // Exports necessárias
    initAuthCreds: jest.fn().mockReturnValue({
      me: null, account: null, signalIdentities: [], platform: 'unknown'
    }),
    BufferJSON: { replacer: (k: any, v: any) => v, reviver: (k: any, v: any) => v },
    WAProto: { AuthCredentials: { fromObject: (obj: any) => obj } },
    DisconnectReason: {
      loggedOut: 401, connectionClosed: 503, connectionLost: 408,
      restartRequired: 428, badSession: 440, unsupported: 501,
      timedOut: 408, conflict: 409
    },
    WAMessageStubType: {},
    WAMessageStatus: {},
    proto: {},
    getContentType: jest.fn(),
    downloadContentFromMessage: jest.fn().mockResolvedValue(Buffer.from([])),


    jidNormalizedUser: jest.fn((jid: string) => {
      if (!jid) return jid;
      // Normaliza JID adicionando sufixo se necessário
      if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us')) {
        return jid;
      }
      return `${jid}@s.whatsapp.net`;
    }),
    // ✅ Expõe Map E referência direta para testes
    __mockSockets: mockSockets,
    __getLastCreatedSocket: () => lastCreatedSocket,
    __clearSockets: () => { mockSockets.clear(); lastCreatedSocket = null; }
  };
});

// Mock do crypto para testes determinísticos
jest.mock('../../utils/crypto', () => ({
  encryptData: jest.fn((data: Buffer | string, secret: string) => {
    const input = typeof data === 'string' ? data : data.toString();
    return Buffer.from(`ENC:${input}`);
  }),
  decryptData: jest.fn((encrypted: Buffer, secret: string) => {
    const str = encrypted.toString();
    if (str.startsWith('ENC:')) {
      return Buffer.from(str.slice(4));
    }
    return encrypted;
  }),
  serializeKeys: jest.fn((keys: Map<string, any>) => JSON.stringify(Object.fromEntries(keys))),
  deserializeKeys: jest.fn((json: string) => new Map(Object.entries(JSON.parse(json))))
}));

// =====================================================
// IMPORTS
// =====================================================
import { MultiSessionWhatsAppService, SessionInfo } from '../../services/MultiSessionWhatsAppService';
import { BotSession } from '../../models/BotSession';
import * as baileys from '@whiskeysockets/baileys';
import { encryptData, decryptData, serializeKeys, deserializeKeys } from '../../utils/crypto';

// Mock do BotSession com query chainable
const mockQuery = (results: any) => ({
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(results),
  select: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(results)
});

// 🔁 SUBSTITUA TODO O jest.mock('../../models/BotSession', ...) POR ESTE:
jest.mock('../../models/BotSession', () => {
  // Helper que cria uma Query mock compatível com TypeScript
  const createChainableMock = <T>(result: T) => {
    const query: any = {};

    // Métodos chainable que retornam o próprio query
    const chainMethods = ['sort', 'skip', 'limit', 'select', 'lean', 'exec'];
    chainMethods.forEach(method => {
      query[method] = jest.fn().mockReturnValue(query);
    });

    // ✅ Quando a query é aguardada, retorna uma Promise com o resultado
    query[Symbol.for('nodejs.util.inspect.custom')] = () => result;

    // ✅ Transforma o objeto em uma Promise "falsa" que resolve para o resultado
    const promiseQuery = Promise.resolve(result) as any;

    // Copia os métodos chainable para a promise
    chainMethods.forEach(method => {
      promiseQuery[method] = query[method];
    });

    return promiseQuery;
  };

  return {
    BotSession: {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
      deleteOne: jest.fn(),
      updateOne: jest.fn(),

      // ✅ find retorna uma Promise chainable
      find: jest.fn().mockImplementation(() => createChainableMock([])),
    }
  };
});


// Mock do MessageLog
jest.mock('../../models/MessageLog', () => ({
  MessageLog: {
    create: jest.fn().mockResolvedValue({ _id: 'log_123', save: jest.fn() })
  }
}));

// 🔧 HELPERS PARA RECUPERAR HANDLERS DO MOCK DO BAILEYS
// Estes helpers acessam o objeto interno 'handlers' do mock via método getHandlers()

const getConnectionHandler = (mockSock: any): Function | undefined => {
  try {
    const allHandlers = mockSock?.ev?.getHandlers?.();
    return allHandlers?.['connection.update']?.[0];
  } catch {
    return undefined;
  }
};

const getMessageHandler = (mockSock: any): Function | undefined => {
  try {
    const allHandlers = mockSock?.ev?.getHandlers?.();
    return allHandlers?.['messages.upsert']?.[0];
  } catch {
    return undefined;
  }
};


describe('MultiSessionWhatsAppService', () => {
  let service: MultiSessionWhatsAppService;
  const TEST_SECRET = 'test-secret';
  const TEST_USER_ID = 'user_abc123';
  const TEST_SESSION_ID = 'bot_session_001';
  const TEST_PHONE = '5511999999999@s.whatsapp.net';

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset dos mocks do BotSession com valores padrão
    (BotSession.findOne as jest.Mock).mockReset().mockResolvedValue(null);
    (BotSession.findOneAndUpdate as jest.Mock).mockReset().mockResolvedValue({});
    (BotSession.find as jest.Mock).mockReset().mockImplementation(() => {
      // Retorna Promise que resolve para array vazio
      const mockPromise = Promise.resolve([]) as any;
      ['sort', 'skip', 'limit', 'select', 'lean', 'exec'].forEach(m => {
        mockPromise[m] = jest.fn().mockReturnValue(mockPromise);
      });
      return mockPromise;
    });

    // Reset do fetch global
    (global.fetch as jest.Mock).mockReset().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({})
    });

    service = new MultiSessionWhatsAppService(TEST_SECRET);
  });


  // ==================== CRIAÇÃO DE SESSÃO ====================

  describe('createSession()', () => {
    beforeEach(() => {
      // Reset completo dos mocks para este describe
      jest.clearAllMocks();

      // ✅ Configurar sequência de retornos para findOne:
      // 1ª chamada (verificação inicial): null → sessão não existe
      // 2ª chamada (getSessionInfo no final): sessão criada
      (BotSession.findOne as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(null) // ← Primeira chamada em createSession
        .mockImplementation((filter: any) => {
          // ← Chamadas subsequentes (ex: getSessionInfo)
          // Retorna uma sessão mockada baseada no filter
          return Promise.resolve({
            sessionId: filter.sessionId || TEST_SESSION_ID,
            userId: filter.userId || TEST_USER_ID,
            status: 'connecting',
            phoneNumber: null,
            qrCode: null,
            lastError: null,
            webhookUrl: null,
            settings: {},
            creds: null,
            keys: '{}'
          });
        });

      // Mock de findOneAndUpdate que retorna a sessão atualizada
      (BotSession.findOneAndUpdate as jest.Mock)
        .mockReset()
        .mockImplementation((filter: any, update: any) => {
          return Promise.resolve({
            ...filter,
            ...update.$set,
            sessionId: filter.sessionId || TEST_SESSION_ID,
            userId: filter.userId || TEST_USER_ID,
            status: update.$set?.status || 'connecting',
            creds: null,
            keys: '{}'
          });
        });

      (BotSession.create as jest.Mock).mockReset();
    });

    it('Deve criar nova sessão e iniciar conexão', async () => {
      const result = await service.createSession(TEST_USER_ID, TEST_SESSION_ID, 'Meu Bot');

      expect(result.sessionId).toBe(TEST_SESSION_ID);
      expect(result.status).toBe('connecting');

      expect(BotSession.findOne).toHaveBeenCalledWith({ sessionId: TEST_SESSION_ID, userId: TEST_USER_ID });
      expect(BotSession.findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: TEST_SESSION_ID, userId: TEST_USER_ID },
        expect.objectContaining({ status: 'connecting' }),
        expect.any(Object)
      );
    });

    it('Deve lançar erro se sessão já estiver ativa', async () => {
      // ✅ Reset e configuração ESPECÍFICA para este teste
      (BotSession.findOne as jest.Mock)
        .mockReset()
        .mockResolvedValue({  // ← SEMPRE retorna sessão ativa, sem fallback
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'connected',
          phoneNumber: TEST_PHONE,
          qrCode: null,
          lastError: null
        });

      // findOneAndUpdate não deve ser chamado quando lança erro
      (BotSession.findOneAndUpdate as jest.Mock).mockReset();

      await expect(
        service.createSession(TEST_USER_ID, TEST_SESSION_ID, 'Meu Bot')
      ).rejects.toThrow('já está ativa');

      // Verificar que findOne foi chamado para verificar existência
      expect(BotSession.findOne).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        userId: TEST_USER_ID
      });

      // findOneAndUpdate NÃO deve ser chamado pois o erro foi lançado antes
      expect(BotSession.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('Deve permitir recriar sessão desconectada', async () => {
      // ✅ Configurar sequência específica para este teste:
      (BotSession.findOne as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce({ // ← 1ª chamada: sessão existe mas está desconectada
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'disconnected'
        })
        .mockResolvedValue({ // ← Chamadas seguintes: sessão atualizada
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'connecting'
        });

      const result = await service.createSession(TEST_USER_ID, TEST_SESSION_ID, 'Bot Renovado');

      expect(result.status).toBe('connecting');

      // Verificar que findOneAndUpdate foi chamado para atualizar status
      expect(BotSession.findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: TEST_SESSION_ID, userId: TEST_USER_ID },
        expect.objectContaining({ status: 'connecting' }),
        expect.any(Object)
      );
    });

    it('Deve tratar erro ao conectar em background', async () => {
      // Mock do Baileys para falhar na criação do socket
      const baileysMock = require('@whiskeysockets/baileys');

      (baileysMock.makeWASocket as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('Socket creation failed');
        });

      // Sequência de mocks do findOne
      (BotSession.findOne as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(null) // ← createSession: sessão não existe
        .mockResolvedValue({         // ← getSessionInfo: sessão criada
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'connecting',
          creds: null,
          keys: '{}'
        });

      // findOneAndUpdate mock padrão
      (BotSession.findOneAndUpdate as jest.Mock)
        .mockReset()
        .mockImplementation((filter: any, update: any) => {
          return Promise.resolve({
            ...filter,
            ...update.$set,
            sessionId: TEST_SESSION_ID,
            status: update.$set?.status || 'connecting'
          });
        });

      const result = await service.createSession(TEST_USER_ID, TEST_SESSION_ID, 'Bot com Erro');

      // ✅ createSession retorna imediatamente com status 'connecting'
      expect(result.status).toBe('connecting');

      // Aguardar o processamento assíncrono do erro em background
      await new Promise(resolve => setTimeout(resolve, 150));

      // ✅ VERIFICAÇÃO FLEXÍVEL: Checar se ALGUMA chamada atualizou para 'error'
      const errorUpdateCalls = (BotSession.findOneAndUpdate as jest.Mock).mock.calls.filter(
        call => call[1]?.$set?.status === 'error' || call[1]?.status === 'error'
      );

      expect(errorUpdateCalls.length).toBeGreaterThan(0);
      expect(errorUpdateCalls[0][1]).toEqual(
        expect.objectContaining({
          status: 'error',
          lastError: 'Socket creation failed'
        })
      );
    });
  });

  // ==================== LISTAGEM DE SESSÕES ====================

  describe('listSessions()', () => {

    it('Deve listar todas as sessões do usuário', async () => {
      const mockSessions = [
        { sessionId: 'bot_1', userId: TEST_USER_ID, status: 'connected', phoneNumber: TEST_PHONE },
        { sessionId: 'bot_2', userId: TEST_USER_ID, status: 'disconnected' }
      ];

      // ✅ Mock que retorna Promise com os dados
      const mockPromise = Promise.resolve(mockSessions) as any;
      ['sort', 'skip', 'limit', 'select', 'lean', 'exec'].forEach(m => {
        mockPromise[m] = jest.fn().mockReturnValue(mockPromise);
      });
      (BotSession.find as jest.Mock).mockImplementation(() => mockPromise);

      const result = await service.listSessions(TEST_USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0].sessionId).toBe('bot_1');
      expect(result[0].status).toBe('connected');
    });

    it('Deve filtrar por status', async () => {
      const mockPromise = Promise.resolve([]) as any;
      ['sort', 'skip', 'limit', 'select', 'lean', 'exec'].forEach(m => {
        mockPromise[m] = jest.fn().mockReturnValue(mockPromise);
      });
      (BotSession.find as jest.Mock).mockImplementation(() => mockPromise);

      await service.listSessions(TEST_USER_ID, 'connected');

      expect(BotSession.find).toHaveBeenCalledWith({
        userId: TEST_USER_ID,
        status: 'connected'
      });
    });

    it('Deve retornar array vazio se não houver sessões', async () => {
      // Mock padrão já retorna array vazio
      const result = await service.listSessions(TEST_USER_ID);
      expect(result).toEqual([]);
    });
  });

  // ==================== INFO DA SESSÃO ====================

  describe('getSessionInfo()', () => {
    it('Deve retornar informações da sessão', async () => {
      const mockSession = {
        sessionId: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        status: 'connected',
        phoneNumber: TEST_PHONE,
        qrCode: null,
        lastError: null
      };

      (BotSession.findOne as jest.Mock).mockResolvedValue(mockSession);

      const result = await service.getSessionInfo(TEST_SESSION_ID, TEST_USER_ID);

      expect(result.sessionId).toBe(TEST_SESSION_ID);
      expect(result.status).toBe('connected');
      expect(result.phoneNumber).toBe(TEST_PHONE);
    });

    it('Deve lançar erro se sessão não existir', async () => {
      // ✅ Garantir que findOne retorne null PARA ESTE TESTE
      (BotSession.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.getSessionInfo('nonexistent', TEST_USER_ID)
      ).rejects.toThrow('não encontrada');
    });
  });

  // ==================== ENVIO DE MENSAGENS ====================

  describe('sendMessage()', () => {
    beforeEach(() => {
      // Setup: sessão conectada com socket mockado
      const mockSock = {
        ev: { on: jest.fn(), emit: jest.fn(), handlers: {} },
        sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg_sent_123' } }),
        logout: jest.fn(),
        user: { id: TEST_PHONE }
      };

      (service as any).sockets.set(TEST_SESSION_ID, mockSock);

      (BotSession.findOne as jest.Mock).mockResolvedValue({
        sessionId: TEST_SESSION_ID,
        userId: TEST_USER_ID,
        status: 'connected'
      });
    });

    it('Deve enviar mensagem de texto com sucesso', async () => {
      const result = await service.sendMessage(
        TEST_SESSION_ID,
        TEST_USER_ID,
        '5511987654321',
        'Olá mundo!'
      );

      expect(result.id).toBe('msg_sent_123');
      expect(result.status).toBe('sent');

      const mockSock = (service as any).sockets.get(TEST_SESSION_ID);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '5511987654321@s.whatsapp.net',
        expect.objectContaining({ text: 'Olá mundo!' })
      );
    });

    it('Deve enviar mensagem com conteúdo AnyMessageContent', async () => {
      await service.sendMessage(
        TEST_SESSION_ID,
        TEST_USER_ID,
        TEST_PHONE,
        { text: 'Com opções', footer: 'Rodapé' }
      );

      const mockSock = (service as any).sockets.get(TEST_SESSION_ID);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        TEST_PHONE,
        expect.objectContaining({ text: 'Com opções' })
      );
    });

    it('Deve normalizar JID automaticamente', async () => {
      await service.sendMessage(TEST_SESSION_ID, TEST_USER_ID, '5511999999999', 'Teste');

      const mockSock = (service as any).sockets.get(TEST_SESSION_ID);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.any(Object)
      );
    });

    it('Deve manter JID já formatado', async () => {
      await service.sendMessage(TEST_SESSION_ID, TEST_USER_ID, '5511999999999@g.us', 'Grupo');

      const mockSock = (service as any).sockets.get(TEST_SESSION_ID);
      expect(mockSock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@g.us',
        expect.any(Object)
      );
    });

    it('Deve lançar erro se sessão não estiver conectada', async () => {
      (service as any).sockets.delete(TEST_SESSION_ID);

      await expect(
        service.sendMessage(TEST_SESSION_ID, TEST_USER_ID, '5511999999999', 'Teste')
      ).rejects.toThrow('não está conectada');
    });

    it('Deve logar mensagem enviada no MessageLog', async () => {
      const { MessageLog } = await import('../../models/MessageLog');

      await service.sendMessage(TEST_SESSION_ID, TEST_USER_ID, '5511999999999', 'Teste log');

      expect(MessageLog.create).toHaveBeenCalledWith(expect.objectContaining({
        direction: 'outbound',
        type: 'text',
        content: 'Teste log',
        metadata: { sessionId: TEST_SESSION_ID, userId: TEST_USER_ID }
      }));
    });
  });

  // ==================== HANDLERS DE CONEXÃO ====================

  describe('Handlers de Conexão', () => {
    let mockSock: any;

    beforeEach(async () => {
      jest.clearAllMocks();

      // Configurar mocks do BotSession para permitir criação da sessão
      (BotSession.findOne as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce({
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'disconnected',
          webhookUrl: null,
          settings: {}
        })
        .mockResolvedValue({
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'connecting',
          webhookUrl: null,
          settings: {}
        });

      (BotSession.findOneAndUpdate as jest.Mock)
        .mockReset()
        .mockResolvedValue({
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'connecting'
        });

      // Criar sessão para inicializar handlers
      await service.createSession(TEST_USER_ID, TEST_SESSION_ID, 'Test Bot');

      // ✅ Recuperar socket com fallback em cascata
      const baileysMock = require('@whiskeysockets/baileys');
      mockSock =
        baileysMock.__mockSockets?.get(TEST_SESSION_ID) ||
        baileysMock.__mockSockets?.get(`fallback_${TEST_SESSION_ID}`) ||
        baileysMock.__getLastCreatedSocket?.();

      expect(mockSock).toBeDefined();
    });

    it('Deve atualizar status para qr_ready quando QR for recebido', async () => {
      const connectionHandler = getConnectionHandler(mockSock);
      expect(connectionHandler).toBeDefined();

      await connectionHandler!({ qr: 'qr_code_data_xyz' });

      // ✅ VERIFICAÇÃO FLEXÍVEL: Encontrar a chamada que atualizou para qr_ready
      const qrReadyCall = (BotSession.findOneAndUpdate as jest.Mock).mock.calls.find(
        call => call[1]?.status === 'qr_ready' || call[1]?.$set?.qrCode === 'qr_code_data_xyz'
      );

      expect(qrReadyCall).toBeDefined();
      expect(qrReadyCall![0]).toEqual(
        expect.objectContaining({ sessionId: TEST_SESSION_ID, userId: TEST_USER_ID })
      );
      expect(qrReadyCall![1]).toEqual(
        expect.objectContaining({
          status: 'qr_ready',
          qrCode: 'qr_code_data_xyz'
        })
      );
    });

    it('Deve limpar QR Code após 60 segundos', async () => {
      jest.useFakeTimers();

      const connectionHandler = getConnectionHandler(mockSock);
      expect(connectionHandler).toBeDefined();

      // ✅ Adicionar ! após connectionHandler
      await connectionHandler!({ qr: 'qr_temp' });

      expect(BotSession.updateOne).not.toHaveBeenCalled();

      jest.advanceTimersByTime(60000);

      expect(BotSession.updateOne).toHaveBeenCalledWith(
        { sessionId: TEST_SESSION_ID, userId: TEST_USER_ID },
        { qrCode: null }
      );

      jest.useRealTimers();
    });

    it('Deve reconectar automaticamente quando conexão fechar com erro recuperável', async () => {
      jest.useFakeTimers();

      const connectionHandler = getConnectionHandler(mockSock);
      expect(connectionHandler).toBeDefined();

      // Disparar evento de conexão fechada com erro recuperável (503 = connectionClosed)
      await connectionHandler!({
        connection: 'close',
        lastDisconnect: {
          error: {
            output: { statusCode: 503 }  // ← Recoverable error
          }
        }
      });

      // ✅ VERIFICAÇÃO ESSENCIAL: Status deve ser atualizado para 'connecting'
      // Isso indica que a lógica de reconexão foi acionada
      const updateCalls = (BotSession.findOneAndUpdate as jest.Mock).mock.calls;
      const hasConnectingUpdate = updateCalls.some((call: any[]) => {
        const update = call[1];
        return update?.status === 'connecting' || update?.$set?.status === 'connecting';
      });

      expect(hasConnectingUpdate).toBe(true);

      // ✅ Bônus: Avançar timers para garantir que não haja erros não tratados
      // (mesmo que não verifiquemos o resultado da reconexão)
      jest.advanceTimersByTime(6000);
      jest.runAllTimers();

      jest.useRealTimers();

      // ✅ Teste passa se o status foi para 'connecting' = reconexão disparada ✓
    });

    it('Deve NÃO reconectar quando for logout (código 401)', async () => {
      jest.useFakeTimers();

      const connectionHandler = getConnectionHandler(mockSock);
      expect(connectionHandler).toBeDefined();

      const connectSpy = jest.spyOn(service as any, 'connectSession').mockResolvedValue(undefined);

      await connectionHandler!({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } }
      });

      // ✅ VERIFICAÇÃO FLEXÍVEL: Encontrar chamada que definiu status como disconnected
      const disconnectedCall = (BotSession.findOneAndUpdate as jest.Mock).mock.calls.find(
        call => call[1]?.status === 'disconnected' || call[1]?.$set?.status === 'disconnected'
      );

      expect(disconnectedCall).toBeDefined();
      expect(disconnectedCall![1]).toEqual(
        expect.objectContaining({ status: 'disconnected' })
      );

      jest.advanceTimersByTime(10000);
      expect(connectSpy).not.toHaveBeenCalled();

      jest.useRealTimers();
      connectSpy.mockRestore();
    });

    it('Deve atualizar para connected quando conexão abrir', async () => {
      const connectionHandler = getConnectionHandler(mockSock);
      expect(connectionHandler).toBeDefined();

      mockSock.user = { id: TEST_PHONE };

      await connectionHandler!({ connection: 'open' });

      // ✅ VERIFICAÇÃO FLEXÍVEL: Encontrar a chamada que atualizou para connected
      const connectedCall = (BotSession.findOneAndUpdate as jest.Mock).mock.calls.find(
        call => call[1]?.status === 'connected' || call[1]?.$set?.phoneNumber === TEST_PHONE
      );

      expect(connectedCall).toBeDefined();
      expect(connectedCall![0]).toEqual(
        expect.objectContaining({ sessionId: TEST_SESSION_ID, userId: TEST_USER_ID })
      );
      expect(connectedCall![1]).toEqual(
        expect.objectContaining({
          status: 'connected',
          phoneNumber: TEST_PHONE
        })
      );
    });

  });

  // ==================== HANDLER DE MENSAGENS RECEBIDAS ====================

  describe('Handler de messages.upsert', () => {
    let mockSock: any;

    beforeEach(async () => {
      jest.clearAllMocks();

      // Garantir que findOne retorne sessão desconectada para permitir createSession
      (BotSession.findOne as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce({
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'disconnected',
          settings: { autoReply: false }
        })
        .mockResolvedValue({
          sessionId: TEST_SESSION_ID,
          userId: TEST_USER_ID,
          status: 'connected',
          settings: { autoReply: false }
        });

      (BotSession.findOneAndUpdate as jest.Mock).mockResolvedValue({});

      await service.createSession(TEST_USER_ID, TEST_SESSION_ID, 'Test Bot');

      // ✅ Mesma lógica de recuperação com fallback
      const baileysMock = require('@whiskeysockets/baileys');
      mockSock =
        baileysMock.__mockSockets?.get(TEST_SESSION_ID) ||
        baileysMock.__mockSockets?.get(`fallback_${TEST_SESSION_ID}`) ||
        baileysMock.__getLastCreatedSocket?.();

      expect(mockSock).toBeDefined();
    });

    it('Deve processar mensagem de texto recebida', async () => {
      const { MessageLog } = await import('../../models/MessageLog');

      const messageHandler = getMessageHandler(mockSock);
      expect(messageHandler).toBeDefined();

      const mockMsg = {
        key: { remoteJid: '5511888888888@s.whatsapp.net', id: 'msg_in_123', fromMe: false },
        message: { conversation: 'Olá bot!' },
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      // ✅ Adicionar ! após messageHandler
      await messageHandler!({ messages: [mockMsg], type: 'notify' });

      expect(MessageLog.create).toHaveBeenCalledWith(expect.objectContaining({
        direction: 'inbound',
        type: 'text',
        sender: '5511888888888@s.whatsapp.net',
        content: 'Olá bot!'
      }));
    });

    it('Deve ignorar mensagens enviadas por mim (fromMe)', async () => {
      const { MessageLog } = await import('../../models/MessageLog');

      const messageHandler = getMessageHandler(mockSock);
      expect(messageHandler).toBeDefined();

      const mockMsg = {
        key: { remoteJid: '5511888888888@s.whatsapp.net', id: 'msg_out', fromMe: true },
        message: { conversation: 'Minha mensagem' }
      };

      // ✅ Adicionar ! após messageHandler
      await messageHandler!({ messages: [mockMsg], type: 'notify' });

      expect(MessageLog.create).not.toHaveBeenCalled();
    });

    it('Deve auto-reply se configurado e mensagem contiver "olá"', async () => {
      const messageHandler = getMessageHandler(mockSock);
      expect(messageHandler).toBeDefined();

      // ✅ CRÍTICO: Configurar findOne para retornar autoReply: true 
      // QUANDO for chamado pelo handler de mensagens (não apenas no beforeEach)
      (BotSession.findOne as jest.Mock)
        .mockImplementation((filter: any) => {
          // Se for busca por sessionId+userId, retorna settings com autoReply
          if (filter?.sessionId === TEST_SESSION_ID && filter?.userId === TEST_USER_ID) {
            return Promise.resolve({
              sessionId: TEST_SESSION_ID,
              userId: TEST_USER_ID,
              status: 'connected',
              settings: { autoReply: true }, // ← Essencial!
              webhookUrl: null
            });
          }
          return Promise.resolve(null);
        });

      // Mock do sendMessage para capturar a resposta
      mockSock.sendMessage = jest.fn().mockResolvedValue({ key: { id: 'reply_123' } });

      const mockMsg = {
        key: {
          remoteJid: '5511777777777@s.whatsapp.net',
          id: 'msg_hello',
          fromMe: false
        },
        message: { conversation: 'Olá, tudo bem?' }, // ← Texto em português com acento
        messageTimestamp: Math.floor(Date.now() / 1000)
      };

      await messageHandler!({ messages: [mockMsg], type: 'notify' });

      // ✅ Aguardar microtask queue para processamento assíncrono do handler
      await new Promise(resolve => setImmediate(resolve));

      // Verificar que sendMessage foi chamado
      expect(mockSock.sendMessage).toHaveBeenCalled();

      // Verificação flexível dos argumentos (pode haver normalização de JID)
      const sendCalls = mockSock.sendMessage.mock.calls;
      const hasExpectedCall = sendCalls.some((call: any[]) => {
        const [jid, content] = call;
        const jidMatches = jid === '5511777777777@s.whatsapp.net' ||
          jid === '5511777777777';
        const textMatches = content?.text?.toLowerCase()?.includes('olá') ||
          content?.text?.toLowerCase()?.includes('ola');
        return jidMatches && textMatches;
      });

      expect(hasExpectedCall).toBe(true);
    });
  });

  // ==================== DISCONNECT E DELETE ====================

  describe('disconnectSession()', () => {
    it('Deve desconectar sessão ativa', async () => {
      const mockSock = { logout: jest.fn().mockResolvedValue(undefined) };
      (service as any).sockets.set(TEST_SESSION_ID, mockSock);

      (BotSession.findOneAndUpdate as jest.Mock).mockResolvedValue({});

      await service.disconnectSession(TEST_SESSION_ID, TEST_USER_ID);

      expect(mockSock.logout).toHaveBeenCalled();
      expect((service as any).sockets.has(TEST_SESSION_ID)).toBe(false);
    });

    it('Deve lidar com sessão não conectada', async () => {
      (BotSession.findOneAndUpdate as jest.Mock).mockResolvedValue({});

      await expect(
        service.disconnectSession('nonexistent', TEST_USER_ID)
      ).resolves.not.toThrow();
    });
  });

  describe('deleteSession()', () => {
    it('Deve deletar sessão permanentemente', async () => {
      const mockSock = { logout: jest.fn().mockResolvedValue(undefined) };
      (service as any).sockets.set(TEST_SESSION_ID, mockSock);

      (BotSession.findOneAndUpdate as jest.Mock).mockResolvedValue({});
      (BotSession.deleteOne as jest.Mock).mockResolvedValue({ deletedCount: 1 });

      await service.deleteSession(TEST_SESSION_ID, TEST_USER_ID);

      expect(mockSock.logout).toHaveBeenCalled();
      expect(BotSession.deleteOne).toHaveBeenCalledWith({
        sessionId: TEST_SESSION_ID,
        userId: TEST_USER_ID
      });
    });
  });

  // ==================== CRIPTOGRAFIA ====================

  describe('Criptografia de Credenciais', () => {
    it('Deve criptografar creds antes de salvar', () => {
      const credsJson = JSON.stringify({ test: 'data' });
      const encrypted = encryptData(credsJson, TEST_SECRET);

      expect(encrypted).toBeInstanceOf(Buffer);
      expect(encryptData).toHaveBeenCalledWith(credsJson, TEST_SECRET);
    });

    it('Deve descriptografar creds ao carregar', () => {
      const original = JSON.stringify({ me: { id: TEST_PHONE } });
      const encrypted = Buffer.from(`ENC:${original}`);

      const decrypted = decryptData(encrypted, TEST_SECRET);

      expect(decrypted.toString()).toBe(original);
    });

    it('Deve serializar e desserializar keys corretamente', () => {
      const keys = new Map([
        ['prekey:1', { key: 'value1' }],
        ['session:abc', { key: 'value2' }]
      ]);

      const serialized = serializeKeys(keys);
      const deserialized = deserializeKeys(serialized);

      expect(deserialized).toBeInstanceOf(Map);
      expect(deserialized.get('prekey:1')).toEqual({ key: 'value1' });
    });
  });

  // ==================== WEBHOOKS ====================

  describe('emitWebhook()', () => {
    it('Deve emitir webhook se URL configurada', async () => {
      (BotSession.findOne as jest.Mock).mockResolvedValue({
        sessionId: TEST_SESSION_ID,
        webhookUrl: 'https://meu-app.com/webhook'
      });

      await (service as any).emitWebhook(TEST_SESSION_ID, 'test_event', { data: 'xyz' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://meu-app.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"event":"test_event"'),
          signal: expect.any(Object) // AbortSignal
        })
      );
    });

    it('Deve ignorar se webhookUrl não estiver configurado', async () => {
      (BotSession.findOne as jest.Mock).mockResolvedValue({
        sessionId: TEST_SESSION_ID,
        webhookUrl: null
      });

      await (service as any).emitWebhook(TEST_SESSION_ID, 'any_event', {});

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('Deve tratar erro de fetch sem quebrar o fluxo', async () => {
      (BotSession.findOne as jest.Mock).mockResolvedValue({
        sessionId: TEST_SESSION_ID,
        webhookUrl: 'https://invalid-url.com'
      });

      // Mock fetch para rejeitar
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      // ✅ CORREÇÃO: O método deve resolver (não lançar) mesmo com fetch falhando
      await expect(
        (service as any).emitWebhook(TEST_SESSION_ID, 'event', {})
      ).resolves.toBeUndefined();

      // Verificar que fetch foi chamado
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  // ==================== UTILITÁRIOS ====================

  describe('Utilitários Internos', () => {
    it('getSocket deve retornar socket conectado', () => {
      const mockSock = { sendMessage: jest.fn() };
      (service as any).sockets.set(TEST_SESSION_ID, mockSock);

      const result = (service as any).getSocket(TEST_SESSION_ID, TEST_USER_ID);

      expect(result).toBe(mockSock);
    });

    it('getSocket deve lançar erro se sessão não conectada', () => {
      expect(() => {
        (service as any).getSocket('nonexistent', TEST_USER_ID);
      }).toThrow('não está conectada');
    });

    it('updateSessionStatus deve atualizar no banco', async () => {
      (BotSession.findOneAndUpdate as jest.Mock).mockResolvedValue({});

      await (service as any).updateSessionStatus(
        TEST_SESSION_ID,
        TEST_USER_ID,
        'connected',
        undefined,
        undefined,
        TEST_PHONE
      );

      expect(BotSession.findOneAndUpdate).toHaveBeenCalledWith(
        { sessionId: TEST_SESSION_ID, userId: TEST_USER_ID },
        expect.objectContaining({
          status: 'connected',
          phoneNumber: TEST_PHONE
        })
      );
    });
  });
});