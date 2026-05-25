// src/__tests__/WhatsAppService.test.ts
/// <reference types="jest" />

// =====================================================
// ⚠️ MOCKS - PRIMEIRAS LINHAS ABSOLUTAS ⚠️
// =====================================================

jest.mock('@whiskeysockets/baileys', () => {
  const mockSock = {
    ev: {
      on: jest.fn((event: string, handler: Function) => {
        (mockSock.ev.handlers as any)[event] = handler;
      }),
      emit: jest.fn(),
      handlers: {} as Record<string, Function>
    },
    sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg_123', remoteJid: '5511999999999@s.whatsapp.net' } }),
    readMessages: jest.fn().mockResolvedValue(undefined),
    sendPresenceUpdate: jest.fn().mockResolvedValue(undefined),
    forwardMessage: jest.fn().mockResolvedValue({ key: { id: 'fwd_456' } }),
    logout: jest.fn().mockResolvedValue(undefined),
    onWhatsApp: jest.fn().mockResolvedValue([{ jid: '5511999999999@s.whatsapp.net', exists: true }]),
    updateMediaMessage: jest.fn()
  };

  const mockMakeWASocket = jest.fn(() => mockSock);

  return {
    __esModule: true,
    default: mockMakeWASocket,
    makeWASocket: mockMakeWASocket,
    useMultiFileAuthState: jest.fn().mockResolvedValue({
      state: { creds: {}, keys: {} },
      saveCreds: jest.fn().mockResolvedValue(undefined)
    }),
    DisconnectReason: { loggedOut: 401, connectionClosed: 503, connectionLost: 408 },
    downloadMediaMessage: jest.fn().mockResolvedValue(Buffer.from('fake-media')),
    jidNormalizedUser: jest.fn((jid: string) => jid)
  };
});

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  createReadStream: jest.fn()
}));

const qrcodeMock = { generate: jest.fn() };
jest.mock('qrcode-terminal', () => qrcodeMock);

jest.mock('pino', () => () => ({
  info: jest.fn(), error: jest.fn(), warn: jest.fn(),
  debug: jest.fn(), child: jest.fn(() => ({ info: jest.fn() })), level: 'silent'
}));

// =====================================================
// IMPORTS
// =====================================================
import * as fs from 'fs';
import { WhatsAppService, MessageResponse, MediaMessage } from '../../services/WhatsAppService';
import * as baileys from '@whiskeysockets/baileys';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  const TEST_SESSION_PATH = '/tmp/test-session';

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockClear();
    qrcodeMock.generate.mockClear();

    service = new WhatsAppService(TEST_SESSION_PATH, fs as any);
  });

  afterEach(() => {
    jest.resetModules();
  });

  // ==================== CONSTRUTOR E INICIALIZAÇÃO ====================

  describe('Constructor', () => {
    it('Deve criar instância com path padrão', () => {
      const defaultService = new WhatsAppService();
      expect(defaultService.sessionPath).toContain('auth_info_baileys');
    });

    it('Deve criar instância com path customizado', () => {
      expect(service.sessionPath).toBe(TEST_SESSION_PATH);
    });

    it('Deve chamar existsSync no construtor', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(TEST_SESSION_PATH);
    });

    it('Deve criar pasta se não existir', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.mkdirSync as jest.Mock).mockClear();

      new WhatsAppService('/tmp/new-session', fs as any);

      expect(fs.mkdirSync).toHaveBeenCalledWith('/tmp/new-session', { recursive: true });
    });

    it('Não deve criar pasta se já existir', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.mkdirSync as jest.Mock).mockClear();

      new WhatsAppService('/tmp/existing', fs as any);

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  // ==================== CONEXÃO ====================

  describe('start()', () => {
    it('✅ Deve iniciar o serviço WhatsApp', async () => {
      await service.start();

      expect(baileys.useMultiFileAuthState).toHaveBeenCalledWith(TEST_SESSION_PATH);

      const makeFn = (baileys as any).default || (baileys as any).makeWASocket;
      expect(makeFn).toHaveBeenCalled();

      const sock = service.getClient() as any;
      expect(sock.ev.on).toHaveBeenCalledWith('connection.update', expect.any(Function));
      expect(sock.ev.on).toHaveBeenCalledWith('creds.update', expect.any(Function));
      expect(sock.ev.on).toHaveBeenCalledWith('messages.upsert', expect.any(Function));
    });

    it('Deve definir isReady=true quando conexão abrir', async () => {
      await service.start();
      expect(service.getStatus()).toBe(false);

      const sock = service.getClient() as any;
      const handler = sock.ev.on.mock.calls.find((c: any) => c[0] === 'connection.update')?.[1];

      await handler({ connection: 'open' });

      expect(service.getStatus()).toBe(true);
    });

    it('Deve lidar com QR code', async () => {
      await service.start();

      const sock = service.getClient() as any;
      const handler = sock.ev.on.mock.calls.find((c: any) => c[0] === 'connection.update')?.[1];

      await handler({ qr: 'fake-qr-code' });

      expect(qrcodeMock.generate).toHaveBeenCalledWith('fake-qr-code', { small: true });
    });

    it('Deve tentar reconectar quando conexão fechar com erro recuperável', async () => {
      // ✅ Ativa fake timers ANTES de qualquer operação
      jest.useFakeTimers();

      const baileysMock = baileys as any;
      const makeFn = baileysMock.default || baileysMock.makeWASocket;

      // ✅ Garante que o mock aceita múltiplas chamadas
      makeFn.mockClear();
      makeFn.mockImplementation(() => ({
        ev: {
          on: jest.fn((event: string, handler: Function) => {
            (mockSock.ev.handlers as any)[event] = handler;
          }),
          emit: jest.fn(),
          handlers: {} as Record<string, Function>
        },
        sendMessage: jest.fn(),
        logout: jest.fn()
      }));

      // MockSock para capturar handlers
      const mockSock = {
        ev: {
          on: jest.fn((event: string, handler: Function) => {
            (mockSock.ev.handlers as any)[event] = handler;
          }),
          emit: jest.fn(),
          handlers: {} as Record<string, Function>
        },
        sendMessage: jest.fn(),
        logout: jest.fn()
      };

      // Inicia serviço (primeira chamada)
      await service.start();
      expect(makeFn).toHaveBeenCalledTimes(1);

      // ✅ CORREÇÃO CRÍTICA: Reset da flag isConnecting para permitir reconexão
      (service as any).isConnecting = false;
      (service as any).isReady = false;

      const sock = service.getClient() as any;
      const handler = sock.ev.on.mock.calls.find((c: any) => c[0] === 'connection.update')?.[1];
      expect(handler).toBeDefined();

      // Simula desconexão recuperável (código 503)
      await handler({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 503 } } }
      });

      // ✅ Avança timers de forma ASSÍNCRONA
      await jest.advanceTimersByTimeAsync(5000);

      // ✅ Aguarda microtasks para o start() interno completar
      await Promise.resolve(); // Aguarda uma microtask
      await jest.runOnlyPendingTimersAsync();

      // ✅ Verifica se makeWASocket foi chamado 2x
      expect(makeFn).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('Não deve reconectar quando for logout', async () => {
      jest.useFakeTimers();

      await service.start();

      const sock = service.getClient() as any;
      const handler = sock.ev.on.mock.calls.find((c: any) => c[0] === 'connection.update')?.[1];

      // Simula logout (código 401 - não recuperável)
      await handler({
        connection: 'close',
        lastDisconnect: { error: { output: { statusCode: 401 } } }
      });

      // Avança timer (não deve disparar reconnect)
      jest.advanceTimersByTime(10000);
      await jest.runAllTimersAsync();

      const makeFn = (baileys as any).default || (baileys as any).makeWASocket;
      expect(makeFn).toHaveBeenCalledTimes(1); // Apenas o start inicial

      jest.useRealTimers();
    });

    it('Deve prevenir múltiplas conexões simultâneas', async () => {
      await service.start();

      // Tenta iniciar novamente enquanto já está conectando
      const startPromise = service.start();

      // Não deve chamar makeWASocket novamente
      const makeFn = (baileys as any).default || (baileys as any).makeWASocket;
      expect(makeFn).toHaveBeenCalledTimes(1);

      await startPromise;
    });
  });


  describe('disconnect() e reconnect()', () => {
    it('Deve desconectar gracefulmente', async () => {
      await service.start();
      service.setReady(true);

      // ✅ Captura referência do socket mockado
      const sock = service.getClient() as any;
      const logoutSpy = sock.logout;

      const mockHandler = jest.fn();
      service.on('disconnected', mockHandler);

      await service.disconnect();

      expect(service.getStatus()).toBe(false);
      expect(service.getClient()).toBeNull();
      expect(logoutSpy).toHaveBeenCalled(); // ✅ Usa referência capturada
      expect(mockHandler).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'user_requested' })
      );
    });

    it('Deve reconectar após desconectar', async () => {
      await service.start();

      const sock = service.getClient() as any;
      const connectionHandler = sock.ev.on.mock.calls.find(
        (c: any) => c[0] === 'connection.update'
      )?.[1];

      await service.disconnect();
      expect(service.getStatus()).toBe(false);

      jest.clearAllMocks();

      await service.reconnect();

      const makeFn = (baileys as any).default || (baileys as any).makeWASocket;
      expect(makeFn).toHaveBeenCalled();

      // ✅ Simula evento de conexão aberta
      const newSock = service.getClient() as any;
      const newHandler = newSock.ev.on.mock.calls.find(
        (c: any) => c[0] === 'connection.update'
      )?.[1];

      if (newHandler) {
        await newHandler({ connection: 'open' });
      }

      expect(service.getStatus()).toBe(true);
    });
  });
  // ==================== ENVIO DE MENSAGENS ====================

  describe('sendMessage() - Texto', () => {
    beforeEach(() => {
      service.setReady(true);
      const mockSock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'msg_123' } }) };
      service.setClient(mockSock as any);
    });

    it('Deve enviar mensagem de texto simples', async () => {
      const result = await service.sendMessage('5511999999999', 'Olá mundo!');

      expect(result).toEqual({
        id: 'msg_123',
        status: 'sent',
        timestamp: expect.any(Number)
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        { text: 'Olá mundo!' },
        undefined
      );
    });

    it('Deve enviar mensagem com conteúdo AnyMessageContent', async () => {
      await service.sendMessage('5511999999999', {
        text: 'Com opções',
        footer: 'Rodapé',
        templateButtons: []
      } as any);

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({ text: 'Com opções' }),
        undefined
      );
    });

    it('Deve enviar mensagem citando outra (quoted)', async () => {
      const quotedMsg = { key: { id: 'original_123' } } as any;

      await service.sendMessage('5511999999999', 'Resposta', { quoted: quotedMsg });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        { text: 'Resposta' },
        { quoted: quotedMsg }
      );
    });

    it('Deve normalizar JID automaticamente', async () => {
      await service.sendMessage('5511999999999', 'Teste');

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net', // Normalizado
        expect.any(Object),
        undefined
      );
    });

    it('Deve manter JID já formatado (@s.whatsapp.net)', async () => {
      await service.sendMessage('5511999999999@s.whatsapp.net', 'Teste');

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net', // Mantido
        expect.any(Object),
        undefined
      );
    });

    it('Deve manter JID de grupo (@g.us)', async () => {
      await service.sendMessage('120363043968293847@g.us', 'Teste grupo');

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '120363043968293847@g.us',
        expect.any(Object),
        undefined
      );
    });

    it('Deve lançar erro se não estiver conectado', async () => {
      service.setReady(false);

      await expect(service.sendMessage('5511999999999', 'Olá'))
        .rejects.toThrow('Cliente WhatsApp não está pronto');
    });

    it('Deve tratar erro de envio e emitir evento de erro', async () => {
      const mockSock = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Network error'))
      };
      service.setClient(mockSock as any);
      service.setReady(true);

      const errorHandler = jest.fn();
      service.on('error', errorHandler);

      await expect(service.sendMessage('5511999999999', 'Olá'))
        .rejects.toThrow('Falha ao enviar mensagem: Network error');

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        action: 'sendMessage',
        error: expect.any(Error),
        jid: '5511999999999@s.whatsapp.net'
      }));
    });
  });

  // ==================== ENVIO DE MÍDIA ====================

  describe('sendImage()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'img_123' } }) } as any);
    });

    it('Deve enviar imagem com Buffer', async () => {
      const result = await service.sendImage('5511999999999', {
        media: Buffer.from('fake-image-data'),
        mimetype: 'image/jpeg',
        caption: 'Minha foto',
        filename: 'foto.jpg'
      });

      expect(result.status).toBe('sent');

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          image: expect.any(Buffer),
          mimetype: 'image/jpeg',
          caption: 'Minha foto',
          fileName: 'foto.jpg'
        })
      );
    });

    it('Deve enviar imagem com URL', async () => {
      await service.sendImage('5511999999999', {
        media: 'https://example.com/image.jpg',
        mimetype: 'image/jpeg',
        caption: 'Foto da web'
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          image: { url: 'https://example.com/image.jpg' },
          caption: 'Foto da web'
        })
      );
    });

    it('Deve enviar imagem sem legenda', async () => {
      await service.sendImage('5511999999999', {
        media: Buffer.from('img'),
        mimetype: 'image/png'
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          image: expect.any(Buffer),
          mimetype: 'image/png',
          caption: undefined
        })
      );
    });
  });

  describe('sendVideo()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'vid_123' } }) } as any);
    });

    it('Deve enviar vídeo normal', async () => {
      await service.sendVideo('5511999999999', {
        media: Buffer.from('fake-video'),
        mimetype: 'video/mp4',
        caption: 'Meu vídeo'
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          video: expect.any(Buffer),
          mimetype: 'video/mp4',
          caption: 'Meu vídeo',
          gifPlayback: false
        })
      );
    });

    it('Deve enviar GIF com gifPlayback=true', async () => {
      await service.sendVideo('5511999999999', {
        media: 'https://example.com/anim.gif',
        mimetype: 'image/gif',
        caption: 'Animado!'
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          video: { url: 'https://example.com/anim.gif' },
          mimetype: 'image/gif',
          gifPlayback: true
        })
      );
    });
  });

  describe('sendDocument()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'doc_123' } }) } as any);
    });

    it('Deve enviar documento com nome personalizado', async () => {
      await service.sendDocument('5511999999999', {
        media: Buffer.from('pdf-content'),
        mimetype: 'application/pdf',
        caption: 'Relatório',
        filename: 'relatorio_final.pdf'
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          document: expect.any(Buffer),
          mimetype: 'application/pdf',
          caption: 'Relatório',
          fileName: 'relatorio_final.pdf'
        })
      );
    });

    it('Deve usar nome padrão se não fornecido', async () => {
      await service.sendDocument('5511999999999', {
        media: 'https://example.com/file.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          document: { url: 'https://example.com/file.docx' },
          fileName: 'document' // Default
        })
      );
    });
  });

  describe('sendAudio()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'aud_123' } }) } as any);
    });

    it('Deve enviar áudio normal', async () => {
      await service.sendAudio('5511999999999', {
        media: Buffer.from('ogg-audio'),
        mimetype: 'audio/ogg; codecs=opus'
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          audio: expect.any(Buffer),
          mimetype: 'audio/ogg; codecs=opus',
          ptt: undefined
        })
      );
    });

    it('Deve enviar nota de voz (PTT)', async () => {
      await service.sendAudio('5511999999999', {
        media: 'https://example.com/voice.ogg',
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
      });

      const sock = service.getClient() as any;
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          audio: { url: 'https://example.com/voice.ogg' },
          ptt: true
        })
      );
    });
  });


  // ==================== MENSAGENS ESPECIAIS ====================

  describe('sendContact()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'contact_123' } }) } as any);
    });

    it('Deve enviar contato com vCard formatado', async () => {
      await service.sendContact('5511999999999', {
        name: 'João Silva',
        number: '5511987654321'
      });

      const sock = service.getClient() as any;

      // ✅ CORREÇÃO: Validar argumento capturado com matchers flexíveis
      const callArgs = sock.sendMessage.mock.calls[0];
      const messageContent = callArgs[1];

      expect(callArgs[0]).toBe('5511999999999@s.whatsapp.net');
      expect(messageContent.contacts).toBeDefined();
      expect(messageContent.contacts.displayName).toBe('João Silva');
      expect(messageContent.contacts.contacts).toHaveLength(1);

      const vcard = messageContent.contacts.contacts[0].vcard;
      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('FN:João Silva');
      expect(vcard).toContain('TEL;type=CELL;waid=5511987654321:5511987654321');
      expect(vcard).toContain('END:VCARD');
    });


  });

  describe('sendLocation()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'loc_123' } }) } as any);
    });

    it('Deve enviar localização com nome opcional', async () => {
      await service.sendLocation('5511999999999', {
        latitude: -23.5505,
        longitude: -46.6333,
        name: 'São Paulo, SP'
      });

      const sock = service.getClient() as any;
      const callArgs = sock.sendMessage.mock.calls[0];
      const location = callArgs[1].location;

      expect(callArgs[0]).toBe('5511999999999@s.whatsapp.net');
      expect(location.degreesLatitude).toBe(-23.5505);
      expect(location.degreesLongitude).toBe(-46.6333);
      expect(location.name).toBe('São Paulo, SP');
    });

    it('Deve enviar localização sem nome', async () => {
      await service.sendLocation('5511999999999', {
        latitude: 0,
        longitude: 0
      });

      const sock = service.getClient() as any;
      const callArgs = sock.sendMessage.mock.calls[0];
      const location = callArgs[1].location;

      expect(callArgs[0]).toBe('5511999999999@s.whatsapp.net');
      expect(location.degreesLatitude).toBe(0);
      expect(location.degreesLongitude).toBe(0);
      expect(location.name).toBeUndefined();
    });


  });

  describe('sendList() e sendButtons()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({
        sendMessage: jest.fn().mockResolvedValue({ key: { id: 'interactive_123' } })
      } as any);
    });

    it('✅ Deve enviar lista interativa', async () => {
      const sections = [{
        title: 'Opções',
        rows: [
          { title: 'Opção 1', description: 'Descrição 1', id: 'opt_1' },
          { title: 'Opção 2', description: 'Descrição 2', id: 'opt_2' }
        ]
      }];

      await service.sendList('5511999999999', 'Menu', 'Escolha:', 'Ver opções', sections);

      const sock = service.getClient() as any;

      // ✅ CORREÇÃO: Capturar argumentos e validar com assertivas simples
      const callArgs = sock.sendMessage.mock.calls[0];
      const messageContent = callArgs[1];

      // Validações básicas
      expect(callArgs[0]).toBe('5511999999999@s.whatsapp.net');
      expect(messageContent.text).toBe('Escolha:');
      expect(messageContent.footer).toBe('Menu');

      // Valida templateButtons
      expect(Array.isArray(messageContent.templateButtons)).toBe(true);
      expect(messageContent.templateButtons).toHaveLength(2);

      // Valida primeira opção
      const firstButton = messageContent.templateButtons[0];
      expect(firstButton.quickReplyButton.displayText).toBe('Opção 1');
      expect(firstButton.quickReplyButton.id).toBe('opt_1');

      // Valida segunda opção
      const secondButton = messageContent.templateButtons[1];
      expect(secondButton.quickReplyButton.displayText).toBe('Opção 2');
      expect(secondButton.quickReplyButton.id).toBe('opt_2');
    });

    it('✅ Deve enviar botões de resposta rápida', async () => {
      const buttons = [
        { id: 'btn_yes', text: 'Sim' },
        { id: 'btn_no', text: 'Não' }
      ];

      await service.sendButtons('5511999999999', 'Confirmar?', buttons);

      const sock = service.getClient() as any;

      // ✅ CORREÇÃO: Validar argumentos capturados
      const callArgs = sock.sendMessage.mock.calls[0];
      const messageContent = callArgs[1];

      expect(callArgs[0]).toBe('5511999999999@s.whatsapp.net');
      expect(messageContent.text).toBe('Confirmar?');
      expect(messageContent.footer).toBe('Escolha uma opção:');

      // Valida templateButtons
      expect(Array.isArray(messageContent.templateButtons)).toBe(true);
      expect(messageContent.templateButtons).toHaveLength(2);

      // Valida botão "Sim"
      const yesButton = messageContent.templateButtons.find(
        (btn: any) => btn.quickReplyButton?.id === 'btn_yes'
      );
      expect(yesButton).toBeDefined();
      expect(yesButton.quickReplyButton.displayText).toBe('Sim');

      // Valida botão "Não"
      const noButton = messageContent.templateButtons.find(
        (btn: any) => btn.quickReplyButton?.id === 'btn_no'
      );
      expect(noButton).toBeDefined();
      expect(noButton.quickReplyButton.displayText).toBe('Não');
    });
  });


  // ==================== GERENCIAMENTO DE MENSAGENS ====================

  describe('markAsRead()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ readMessages: jest.fn().mockResolvedValue(undefined) } as any);
    });

    it('Deve marcar mensagens como lidas', async () => {
      await service.markAsRead('5511999999999', ['msg_1', 'msg_2']);

      const sock = service.getClient() as any;
      expect(sock.readMessages).toHaveBeenCalledWith([
        { id: 'msg_1', fromMe: false, remoteJid: '5511999999999' },
        { id: 'msg_2', fromMe: false, remoteJid: '5511999999999' }
      ]);
    });
  });

  describe('sendReaction()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'react_123' } }) } as any);
    });

    it('Deve reagir a mensagem com emoji', async () => {
      await service.sendReaction('5511999999999', 'original_msg_456', '👍');

      const sock = service.getClient() as any;

      // ✅ CORREÇÃO: Esperar JID normalizado em todos os lugares
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',  // ← JID normalizado
        expect.objectContaining({
          react: {
            text: '👍',
            key: {
              id: 'original_msg_456',
              fromMe: false,
              remoteJid: '5511999999999@s.whatsapp.net'  // ← JID normalizado aqui também
            }
          }
        })
      );
    });
  });

  describe('forwardMessage()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ forwardMessage: jest.fn().mockResolvedValue({ key: { id: 'fwd_789' } }) } as any);
    });

    it('Deve encaminhar mensagem', async () => {
      const originalMsg = { key: { id: 'orig_123' }, message: { conversation: 'Olá' } } as any;

      const result = await service.forwardMessage('5511999999999', originalMsg);

      expect(result.id).toBe('fwd_789');

      const sock = service.getClient() as any;
      expect(sock.forwardMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        originalMsg,
        undefined
      );
    });

    it('Deve encaminhar com força (forceForward)', async () => {
      const originalMsg = { key: { id: 'orig_123' } } as any;

      await service.forwardMessage('5511999999999', originalMsg, { forceForward: true });

      const sock = service.getClient() as any;
      expect(sock.forwardMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        originalMsg,
        { forceForward: true }
      );
    });
  });

  describe('deleteMessage()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn().mockResolvedValue({ key: { id: 'del_123' } }) } as any);
    });

    it('Deve deletar mensagem apenas para mim', async () => {
      await service.deleteMessage('5511999999999', 'msg_to_delete', true);

      const sock = service.getClient() as any;

      // ✅ CORREÇÃO: Esperar JID normalizado
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          delete: expect.objectContaining({
            id: 'msg_to_delete',
            fromMe: true,
            remoteJid: '5511999999999@s.whatsapp.net',  // ← Normalizado
            participant: undefined  // ← undefined quando onlyForMe=true
          })
        })
      );
    });

    it('Deve deletar mensagem para todos', async () => {
      await service.deleteMessage('5511999999999', 'msg_to_delete', false);

      const sock = service.getClient() as any;

      // ✅ CORREÇÃO: Esperar JID normalizado em participant também
      expect(sock.sendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        expect.objectContaining({
          delete: expect.objectContaining({
            id: 'msg_to_delete',
            fromMe: false,
            remoteJid: '5511999999999@s.whatsapp.net',  // ← Normalizado
            participant: '5511999999999@s.whatsapp.net'  // ← Normalizado quando onlyForMe=false
          })
        })
      );
    });
  });


  // ==================== UTILITÁRIOS ====================

  describe('normalizeJid()', () => {
    it('Deve adicionar @s.whatsapp.net em número limpo', () => {
      expect(service.normalizeJid('5511999999999')).toBe('5511999999999@s.whatsapp.net');
    });

    it('Deve remover caracteres não numéricos', () => {
      expect(service.normalizeJid('+55 (11) 99999-9999')).toBe('5511999999999@s.whatsapp.net');
    });

    it('Deve manter JID já formatado', () => {
      expect(service.normalizeJid('5511999999999@s.whatsapp.net')).toBe('5511999999999@s.whatsapp.net');
    });

    it('Deve manter JID de grupo', () => {
      expect(service.normalizeJid('120363043968293847@g.us')).toBe('120363043968293847@g.us');
    });
  });

  describe('parseMessage()', () => {
    it('Deve parsear mensagem de texto simples', () => {
      const rawMsg = {
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'msg_123', fromMe: false },
        message: { conversation: 'Olá mundo!' },
        messageTimestamp: Math.floor(Date.now() / 1000)
      } as any;

      const parsed = service.parseMessage(rawMsg);

      expect(parsed).toEqual({
        id: 'msg_123',
        sender: '5511999999999@s.whatsapp.net',
        body: 'Olá mundo!',
        timestamp: expect.any(Number),
        isGroup: false,
        type: 'text',
        raw: rawMsg
      });
    });

    it('Deve parsear mensagem com extendedTextMessage', () => {
      const rawMsg = {
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'msg_456', fromMe: false },
        message: { extendedTextMessage: { text: 'Texto longo...' } }
      } as any;

      const parsed = service.parseMessage(rawMsg);

      expect(parsed.body).toBe('Texto longo...');
      expect(parsed.type).toBe('text');
    });

    it('Deve identificar mensagem de grupo', () => {
      const rawMsg = {
        key: { remoteJid: '120363043968293847@g.us', id: 'grp_123', fromMe: false },
        message: { conversation: 'Mensagem no grupo' }
      } as any;

      const parsed = service.parseMessage(rawMsg);

      expect(parsed.isGroup).toBe(true);
      expect(parsed.sender).toBe('120363043968293847@g.us');
    });

    it('Deve parsear legenda de imagem', () => {
      const rawMsg = {
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'img_123', fromMe: false },
        message: { imageMessage: { caption: 'Minha foto!' } }
      } as any;

      const parsed = service.parseMessage(rawMsg);

      expect(parsed.body).toBe('Minha foto!');
      expect(parsed.type).toBe('media');
    });

    it('Deve retornar string vazia se sem corpo', () => {
      const rawMsg = {
        key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'empty_123', fromMe: false },
        message: {}
      } as any;

      const parsed = service.parseMessage(rawMsg);

      expect(parsed.body).toBe('');
    });
  });

  describe('downloadMedia()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ updateMediaMessage: jest.fn() } as any);
    });

    it('Deve baixar mídia como Buffer', async () => {
      const rawMsg = { key: { id: 'media_123' } } as any;

      const result = await service.downloadMedia(rawMsg);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(baileys.downloadMediaMessage).toHaveBeenCalled();
    });

    it('Deve salvar mídia em arquivo se outputPath fornecido', async () => {
      const rawMsg = { key: { id: 'media_456' } } as any;

      await service.downloadMedia(rawMsg, '/tmp/downloaded.jpg');

      expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/downloaded.jpg', expect.any(Buffer));
    });

    it('Deve lançar erro se cliente não conectado', async () => {
      service.setClient(null);

      await expect(service.downloadMedia({} as any))
        .rejects.toThrow('Cliente não conectado');
    });
  });

  describe('verifyNumber()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ onWhatsApp: jest.fn().mockResolvedValue([{ jid: '5511999999999@s.whatsapp.net', exists: true }]) } as any);
    });

    it('Deve verificar se número existe no WhatsApp', async () => {
      const result = await service.verifyNumber('5511999999999');

      expect(result.exists).toBe(true);
      expect(result.jid).toBe('5511999999999@s.whatsapp.net');
    });

    it('Deve retornar exists=false se número não encontrado', async () => {
      const mockSock = { onWhatsApp: jest.fn().mockResolvedValue([]) };
      service.setClient(mockSock as any);

      const result = await service.verifyNumber('5511000000000');

      expect(result.exists).toBe(false);
      expect(result.jid).toBeUndefined();
    });
  });

  describe('updatePresence()', () => {
    beforeEach(() => {
      service.setReady(true);
      service.setClient({ sendPresenceUpdate: jest.fn().mockResolvedValue(undefined) } as any);
    });

    it.each([
      ['available', 'online'],
      ['unavailable', 'offline'],
      ['composing', 'digitando'],
      ['recording', 'gravando'],
      ['paused', 'parado']
    ])('Deve atualizar presença para "%s"', async (presence, description) => {
      await service.updatePresence('5511999999999', presence as any);

      const sock = service.getClient() as any;
      expect(sock.sendPresenceUpdate).toHaveBeenCalledWith(
        presence,
        '5511999999999@s.whatsapp.net'
      );
    });
  });


  // ==================== SISTEMA DE EVENTOS ====================

  describe('Eventos (on/off/emit)', () => {
    it('Deve registrar e disparar handler de evento', () => {
      const handler = jest.fn();
      service.on('message', handler);

      (service as any).emit('message', { body: 'teste' });

      expect(handler).toHaveBeenCalledWith({ body: 'teste' });
    });

    it('Deve remover handler com off()', () => {
      const handler = jest.fn();

      // Registra o handler
      service.on('message', handler);

      // ✅ CORREÇÃO: Chamar o método .emit() da instância, não a instância como função
      (service as any).emit('message', { body: 'teste' });

      // Verifica que foi chamado
      expect(handler).toHaveBeenCalledTimes(1);

      // Remove o handler
      service.off('message', handler);

      // Emite novamente
      (service as any).emit('message', { body: 'teste' });

      // ✅ Verifica que NÃO foi chamado após remover
      expect(handler).toHaveBeenCalledTimes(1); // Ainda 1, não 2
    });

    it('Deve suportar múltiplos handlers para mesmo evento', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      service.on('connected', handler1);
      service.on('connected', handler2);

      (service as any).emit('connected');

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('Deve emitir evento de QR quando recebido', async () => {
      const qrHandler = jest.fn();
      service.on('qr', qrHandler);

      await service.start();

      const sock = service.getClient() as any;
      const handler = sock.ev.on.mock.calls.find((c: any) => c[0] === 'connection.update')?.[1];

      await handler({ qr: 'qr_code_data' });

      expect(qrHandler).toHaveBeenCalledWith('qr_code_data');
    });

    it('Deve emitir evento de erro quando sendMessage falha', async () => {
      const errorHandler = jest.fn();
      service.on('error', errorHandler);

      service.setReady(true);
      const mockSock = { sendMessage: jest.fn().mockRejectedValue(new Error('Fail')) };
      service.setClient(mockSock as any);

      await expect(service.sendMessage('5511999999999', 'teste')).rejects.toThrow();

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        action: 'sendMessage',
        error: expect.any(Error)
      }));
    });
  });

  describe('Handlers de Evento', () => {
    it('Deve emitir evento de presença', async () => {
      const presenceHandler = jest.fn();
      service.on('presence', presenceHandler);

      await service.start();
      const sock = service.getClient() as any;
      const presenceHandler_registered = sock.ev.on.mock.calls.find(
        (c: any) => c[0] === 'presence.update'
      )?.[1];

      await presenceHandler_registered({ id: '5511999999999@s.whatsapp.net', presence: 'available' });

      expect(presenceHandler).toHaveBeenCalled();
    });

    it('Deve responder ao comando !ping', async () => {
      // 1. Iniciar serviço para registrar handlers
      await service.start();

      // 2. Capturar o handler ANTES de mudar o client
      const sock = service.getClient() as any;
      const messageHandler = sock.ev.on.mock.calls.find(
        (c: any) => c[0] === 'messages.upsert'
      )?.[1];

      expect(messageHandler).toBeDefined();

      // 3. Configurar mock para sendMessage
      const mockSendMessage = jest.fn().mockResolvedValue({ key: { id: 'pong_msg' } });
      service.setClient({
        sendMessage: mockSendMessage,
        ev: sock.ev
      } as any);

      service.setReady(true);

      // 4. Simular mensagem !ping
      await messageHandler({
        messages: [{
          key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'msg_1', fromMe: false },
          message: { conversation: '!ping' }
        }],
        type: 'notify'
      });

      // ✅ CORREÇÃO: Esperar o terceiro argumento 'undefined'
      expect(mockSendMessage).toHaveBeenCalledWith(
        '5511999999999@s.whatsapp.net',
        { text: 'Pong! 🏓' },
        undefined  // ← ✅ Adicionar este argumento!
      );
    });
  });
  // ==================== ESTADO E GETTERS/SETTERS ====================

  describe('Estado', () => {
    it('Deve retornar status inicial como false', () => {
      expect(service.getStatus()).toBe(false);
    });

    it('Deve permitir definir status como true via setter', () => {
      service.setReady(true);
      expect(service.getStatus()).toBe(true);
    });

    it('Deve retornar isConnectingStatus', () => {
      expect(service.isConnectingStatus()).toBe(false);
    });

    it('Deve retornar cliente null inicialmente', () => {
      expect(service.getClient()).toBeNull();
    });

    it('Deve permitir definir cliente via setter', () => {
      const mockClient = { sendMessage: jest.fn() } as any;
      service.setClient(mockClient);
      expect(service.getClient()).toBe(mockClient);
    });
  });

  // ==================== VALIDAÇÕES E ERROS ====================

  describe('Validações', () => {
    it('Deve validar conexão antes de enviar mensagem', () => {
      service.setReady(false);

      expect(() => {
        (service as any).validateConnection();
      }).toThrow('Cliente WhatsApp não está pronto');
    });

    it('Deve permitir operação quando conectado', () => {
      // ✅ CORREÇÃO: Definir BOTH isReady E sock antes de validar
      service.setReady(true);
      service.setClient({ sendMessage: jest.fn() } as any); // ← Mock mínimo do socket

      // Agora a validação deve passar sem lançar erro
      expect(() => {
        (service as any).validateConnection();
      }).not.toThrow();
    });
  });

  describe('Caminhos de Erro', () => {
    it('Deve lançar erro no start() quando useMultiFileAuthState falhar', async () => {
      jest.mocked(baileys.useMultiFileAuthState).mockRejectedValueOnce(
        new Error('Auth failed')
      );

      await expect(service.start()).rejects.toThrow('Auth failed');
      expect(service.isConnectingStatus()).toBe(false);
    });

    it('Deve prevenir múltiplas conexões simultâneas', async () => {
      const startPromise1 = service.start();
      const startPromise2 = service.start(); // Deve retornar imediatamente

      await Promise.all([startPromise1, startPromise2]);

      const makeFn = (baileys as any).default || (baileys as any).makeWASocket;
      expect(makeFn).toHaveBeenCalledTimes(1); // Apenas uma chamada
    });

    it('Deve tratar erro ao enviar mensagem', async () => {
      service.setReady(true);
      const mockSock = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Network error'))
      };
      service.setClient(mockSock as any);

      const errorHandler = jest.fn();
      service.on('error', errorHandler);

      await expect(service.sendMessage('5511999999999', 'teste'))
        .rejects.toThrow('Falha ao enviar mensagem: Network error');

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sendMessage' })
      );
    });

    it('Deve retornar exists=false quando verifyNumber não encontrar', async () => {
      service.setReady(true);
      const mockSock = { onWhatsApp: jest.fn().mockResolvedValue([]) };
      service.setClient(mockSock as any);

      const result = await service.verifyNumber('5511000000000');

      expect(result.exists).toBe(false);
      expect(result.jid).toBeUndefined();
    });
  });

  describe('sendMedia() - Caminhos de Erro', () => {
    it('Deve emitir evento de erro quando sendMedia falhar', async () => {
      service.setReady(true);
      const mockSock = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Media upload failed'))
      };
      service.setClient(mockSock as any);

      const errorHandler = jest.fn();
      service.on('error', errorHandler);

      await expect(service.sendImage('5511999999999', {
        media: Buffer.from('fake'),
        mimetype: 'image/jpeg'
      })).rejects.toThrow('Falha ao enviar mídia: Media upload failed');

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sendMedia',
          error: expect.any(Error),
          jid: '5511999999999@s.whatsapp.net'
        })
      );
    });
  });

  describe('Cobertura Total - Branches Restantes', () => {
    it('Deve emitir evento qr quando QR code for recebido', async () => {
      const qrHandler = jest.fn();
      service.on('qr', qrHandler);

      await service.start();

      const sock = service.getClient() as any;
      const connectionHandler = sock.ev.on.mock.calls.find(
        (c: any) => c[0] === 'connection.update'
      )?.[1];

      await connectionHandler({ qr: 'qr_code_data_123' });

      expect(qrHandler).toHaveBeenCalledWith('qr_code_data_123');
    });

    it('Deve emitir evento de erro quando sendMedia falhar', async () => {
      service.setReady(true);
      const mockSock = {
        sendMessage: jest.fn().mockRejectedValue(new Error('Media upload failed'))
      };
      service.setClient(mockSock as any);

      const errorHandler = jest.fn();
      service.on('error', errorHandler);

      await expect(service.sendImage('5511999999999', {
        media: Buffer.from('fake'),
        mimetype: 'image/jpeg'
      })).rejects.toThrow('Falha ao enviar mídia: Media upload failed');

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sendMedia',
          error: expect.any(Error),
          jid: '5511999999999@s.whatsapp.net'
        })
      );
    });

    it('Deve ignorar mensagens que não são do tipo notify', async () => {
      await service.start();
      service.setReady(true);
      const mockSendMessage = jest.fn();
      service.setClient({ sendMessage: mockSendMessage, ev: (service.getClient() as any).ev } as any);

      const sock = service.getClient() as any;
      const messageHandler = sock.ev.on.mock.calls.find(
        (c: any) => c[0] === 'messages.upsert'
      )?.[1];

      await messageHandler({
        messages: [{
          key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'msg_1', fromMe: false },
          message: { conversation: '!ping' }
        }],
        type: 'append' // Não é 'notify'
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('Deve ignorar mensagens enviadas por mim (fromMe)', async () => {
      await service.start();
      service.setReady(true);
      const mockSendMessage = jest.fn();
      service.setClient({ sendMessage: mockSendMessage, ev: (service.getClient() as any).ev } as any);

      const sock = service.getClient() as any;
      const messageHandler = sock.ev.on.mock.calls.find(
        (c: any) => c[0] === 'messages.upsert'
      )?.[1];

      await messageHandler({
        messages: [{
          key: { remoteJid: '5511999999999@s.whatsapp.net', id: 'msg_1', fromMe: true },
          message: { conversation: '!ping' }
        }],
        type: 'notify'
      });

      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

});