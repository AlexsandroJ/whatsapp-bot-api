// src/services/MultiSessionWhatsAppService.ts
import makeWASocket, {
  DisconnectReason,
  WASocket,
  AnyMessageContent,
  ConnectionState,
  WAMessage,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { BotSession } from '../models/BotSession';
import useMongoAuthState from './auth/MongoAuthState';
import { MessageLog } from '../models/MessageLog';
import { url } from 'inspector/promises';

export type SessionStatus = 'disconnected' | 'qr_ready' | 'connecting' | 'connected' | 'error';

export interface SessionInfo {
  sessionId: string;
  userId: string;
  status: SessionStatus;
  phoneNumber?: string;
  qrCode?: string;
  lastError?: string;
}

export class MultiSessionWhatsAppService {
  private sockets: Map<string, WASocket> = new Map();
  private connectionPromises: Map<string, Promise<void>> = new Map();
  private readonly encryptionSecret: string;

  constructor(encryptionSecret: string) {
    this.encryptionSecret = encryptionSecret;
  }

  // ==================== GERENCIAMENTO DE SESSÕES ====================

  /**
   * Criar nova sessão (gera QR Code)
   */
  public async createSession(userId: string, sessionId: string, name: string): Promise<SessionInfo> {
    // Verificar se já existe
    const existing = await BotSession.findOne({ sessionId, userId });
    if (existing && existing.status !== 'disconnected') {
      throw new Error(`Sessão ${sessionId} já está ativa`);
    }

    // Atualizar ou criar sessão no DB
    await BotSession.findOneAndUpdate(
      { sessionId, userId },
      {
        name,
        status: 'connecting',
        qrCode: null,
        lastError: null
      },
      { upsert: true, new: true }
    );

    // Iniciar conexão em background
    this.connectSession(userId, sessionId).catch(error => {
      console.error(`❌ Erro ao conectar sessão ${sessionId}:`, error);
      this.updateSessionStatus(sessionId, userId, 'error', error.message);
    });

    return this.getSessionInfo(sessionId, userId);
  }

  /**
   * Conectar sessão ao WhatsApp
   */
  private async connectSession(userId: string, sessionId: string): Promise<void> {
    if (this.connectionPromises.has(sessionId)) {
      return this.connectionPromises.get(sessionId)!;
    }

    const connectPromise = (async () => {
      try {
        await this.updateSessionStatus(sessionId, userId, 'connecting');

        // Obter auth state do MongoDB
        const { state, saveCreds } = await useMongoAuthState(
          sessionId,
          userId,
          this.encryptionSecret
        );

        // Criar socket
        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: false, // Não imprimir no terminal
          logger: pino({ level: 'silent' }),
          browser: ['WhatsApp Bot API', 'Chrome', '1.0.0'],
          defaultQueryTimeoutMs: undefined,
          syncFullHistory: false
        });

        this.sockets.set(sessionId, sock);

        // Configurar handlers
        this.setupSessionHandlers(sock, sessionId, userId, saveCreds);

      } catch (error: any) {
        console.error(`❌ Erro ao conectar sessão ${sessionId}:`, error);
        await this.updateSessionStatus(sessionId, userId, 'error', error.message);
        throw error;
      }
    })();

    this.connectionPromises.set(sessionId, connectPromise);
    return connectPromise;
  }

  /**
   * Configurar handlers para uma sessão específica
   */
  private setupSessionHandlers(
    sock: WASocket,
    sessionId: string,
    userId: string,
    saveCreds: () => Promise<void>
  ): void {

    // Handler de conexão
    sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code disponível
      if (qr) {
        console.log(`📱 QR Code para sessão ${sessionId}`);
        qrcode.generate(qr, { small: true });

        // Salvar QR no DB (efêmero - expira em 60s)
        await this.updateSessionStatus(sessionId, userId, 'qr_ready', undefined, qr);

        // Emitir evento para webhook (se configurado)
        await this.emitWebhook(sessionId, 'qr_generated', { qr });
      }

      // Conexão fechada
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`🔌 Sessão ${sessionId} fechada. Código: ${statusCode}. Reconectar: ${shouldReconnect}`);

        await this.updateSessionStatus(
          sessionId,
          userId,
          shouldReconnect ? 'connecting' : 'disconnected',
          lastDisconnect?.error?.message
        );

        // Remover socket da memória
        this.sockets.delete(sessionId);

        // Reconectar automaticamente se necessário
        if (shouldReconnect) {
          console.log(`🔄 Tentando reconectar sessão ${sessionId} em 5s...`);
          setTimeout(() => {
            this.connectSession(userId, sessionId).catch(console.error);
          }, 5000);
        }
      }

      // Conexão aberta
      if (connection === 'open') {
        console.log(`✅ Sessão ${sessionId} conectada!`);

        // Obter número conectado
        const phoneNumber = sock.user?.id;

        await this.updateSessionStatus(
          sessionId,
          userId,
          'connected',
          undefined,
          undefined,
          phoneNumber
        );

        // Emitir evento de conexão
        await this.emitWebhook(sessionId, 'connected', { phoneNumber });
      }
    });

    // Salvar credenciais atualizadas
    sock.ev.on('creds.update', async () => {
      await saveCreds();
    });

    // Handler de mensagens recebidas
    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === 'notify') {
        const sender = jidNormalizedUser(msg.key.remoteJid || '');
        const body = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || '';

        console.log(`📩 [${sessionId}] Mensagem de ${sender}: ${body}`);

        // Log da mensagem
        await MessageLog.create({
          direction: 'inbound',
          type: body ? 'text' : 'image',
          sender,
          recipient: sessionId,
          content: body || '[Mídia]',
          messageId: msg.key.id || '',
          status: 'pending',
          metadata: { sessionId, userId }
        });

        // Emitir evento para webhook
        await this.emitWebhook(sessionId, 'message_received', {
          sender,
          body,
          messageId: msg.key.id,
          timestamp: msg.messageTimestamp
        });

        // Auto-reply se configurado
        const session = await BotSession.findOne({ sessionId, userId });
        if (session?.settings.autoReply && body.toLowerCase().includes('olá')) {
          await sock.sendMessage(sender, { text: 'Olá! Sou um bot. Como posso ajudar? 🤖' });
        }
      }
    });

    // Handler de presença
    sock.ev.on('presence.update', async (update) => {
      await this.emitWebhook(sessionId, 'presence_update', update);
    });
  }

  // ==================== OPERAÇÕES POR SESSÃO ====================

  /**
   * Obter informações de uma sessão
   */
  public async getSessionInfo(sessionId: string, userId: string): Promise<SessionInfo> {
    const session = await BotSession.findOne({ sessionId, userId });

    if (!session) {
      throw new Error(`Sessão ${sessionId} não encontrada`);
    }

    return {
      sessionId: session.sessionId,
      userId: session.userId.toString(),
      status: session.status,
      phoneNumber: session.phoneNumber,
      qrCode: session.qrCode,
      lastError: session.lastError
    };
  }

  /**
   * Listar sessões de um usuário
   */
  public async listSessions(userId: string, status?: SessionStatus): Promise<SessionInfo[]> {
    const query: any = { userId };
    if (status) query.status = status;

    const sessions = await BotSession.find(query).sort({ createdAt: -1 });

    return sessions.map(s => ({
      sessionId: s.sessionId,
      userId: s.userId.toString(),
      status: s.status,
      phoneNumber: s.phoneNumber,
      qrCode: s.qrCode,
      lastError: s.lastError
    }));
  }

  /**
   * Enviar mensagem por uma sessão específica
   */
  public async sendMessage(
    sessionId: string,
    userId: string,
    jid: string,
    content: string | AnyMessageContent
  ): Promise<{ id: string; status: string }> {
    const sock = this.getSocket(sessionId, userId);

    const normalizedJid = jid.includes('@') ? jid : `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    const messageContent: AnyMessageContent = typeof content === 'string' ? { text: content } : content;

    const result = await sock.sendMessage(normalizedJid, messageContent);

    // Log da mensagem enviada
    await MessageLog.create({
      direction: 'outbound',
      type: typeof content === 'string' ? 'text' : 'image',
      recipient: normalizedJid,
      content: typeof content === 'string' ? content : '[Mídia]',
      messageId: result?.key?.id || '',
      status: 'sent',
      metadata: { sessionId, userId }
    });

    return {
      id: result?.key?.id || 'unknown',
      status: 'sent'
    };
  }

  /**
   * Desconectar uma sessão
   */
  public async disconnectSession(sessionId: string, userId: string): Promise<void> {
    const sock = this.sockets.get(sessionId);

    if (sock) {
      await sock.logout();
      this.sockets.delete(sessionId);
    }

    await this.updateSessionStatus(sessionId, userId, 'disconnected');
    await this.emitWebhook(sessionId, 'disconnected', { reason: 'user_requested' });
  }

  /**
   * Deletar uma sessão (limpa dados do banco)
   */
  public async deleteSession(sessionId: string, userId: string): Promise<void> {
    // Desconectar se estiver ativa
    await this.disconnectSession(sessionId, userId).catch(() => { });

    // Remover do banco
    await BotSession.deleteOne({ sessionId, userId });

    // Limpar da memória
    this.sockets.delete(sessionId);
    this.connectionPromises.delete(sessionId);
  }

  // ==================== UTILITÁRIOS INTERNOS ====================

  private getSocket(sessionId: string, userId: string): WASocket {
    const sock = this.sockets.get(sessionId);

    if (!sock) {
      throw new Error(`Sessão ${sessionId} não está conectada`);
    }

    return sock;
  }

  private async updateSessionStatus(
    sessionId: string,
    userId: string,
    status: SessionStatus,
    error?: string,
    qrCode?: string,
    phoneNumber?: string
  ): Promise<void> {
    const update: any = { status };

    if (error) update.lastError = error;
    if (qrCode) {
      update.qrCode = qrCode;
      // QR expira em 60 segundos - agendar limpeza
      setTimeout(async () => {
        await BotSession.updateOne({ sessionId, userId }, { qrCode: null });
      }, 60000);
    }
    if (phoneNumber) {
      update.phoneNumber = phoneNumber;
      update.lastConnectedAt = new Date();
    }

    await BotSession.findOneAndUpdate({ sessionId, userId }, update);
  }

  // No MultiSessionWhatsAppService.ts, método emitWebhook:
  private async emitWebhook(sessionId: string, event: string, data: any): Promise<void> {
    const session = await BotSession.findOne({ sessionId });

    if (!session?.webhookUrl) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        await fetch(session.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, sessionId, timestamp: new Date().toISOString(), data }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // ✅ CORREÇÃO: Logar erro mas não propagar
      console.error(`❌ Falha ao emitir webhook para ${sessionId}:`, error);
      // Não throw - webhook é best-effort
    }
  }
}

// Singleton para a aplicação
export const multiSessionService = new MultiSessionWhatsAppService(
  process.env.JWT_SECRET || 'fallback-secret-change-in-production'
);

export default MultiSessionWhatsAppService;