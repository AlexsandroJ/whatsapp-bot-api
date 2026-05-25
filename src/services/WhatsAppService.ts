import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  AnyMessageContent,
  ConnectionState,
  WAMessage,
  proto,
  downloadMediaMessage,
  jidNormalizedUser
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { pipeline } from 'stream';

// Interface para injeção de dependências (testes)
export interface FileSystemAdapter {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  writeFileSync(path: string, data: Buffer | string): void;
  createReadStream(path: string): NodeJS.ReadStream;
}

// Tipos para mensagens
export type MessageResponse = { id: string; status: 'sent' | 'pending' | 'failed'; timestamp: number };
export type MediaMessage = {
  media: Buffer | string; // Buffer ou URL/caminho
  mimetype: string;
  filename?: string;
  caption?: string;
};

export class WhatsAppService {
  private sock: WASocket | null = null;
  private isReady: boolean = false;
  private isConnecting: boolean = false;
  public readonly sessionPath: string;

  // Dependencies injetáveis
  private fsAdapter: FileSystemAdapter;
  private readonly streamPipeline = promisify(pipeline);

  constructor(
    sessionPath?: string,
    fsAdapter?: FileSystemAdapter
  ) {
    this.sessionPath = sessionPath || path.join(__dirname, '../../auth_info_baileys');
    this.fsAdapter = fsAdapter || (fs as unknown as FileSystemAdapter);
    this.ensureSessionDirectory();
  }

  // ==================== CONFIGURAÇÃO ====================

  protected ensureSessionDirectory(): void {
    if (!this.fsAdapter.existsSync(this.sessionPath)) {
      this.fsAdapter.mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  public async start(): Promise<void> {
    if (this.isConnecting) {
      console.log('⏳ Conexão já em andamento...');
      return;
    }

    this.isConnecting = true;
    console.log('🔄 Iniciando conexão com WhatsApp...');

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['WhatsApp Bot API', 'Chrome', '1.0.0'],
        defaultQueryTimeoutMs: undefined,
        syncFullHistory: false
      });

      this.setupEventHandlers(saveCreds);
      console.log('✅ Handlers de evento configurados');

    } catch (error) {
      console.error('❌ Erro ao iniciar WhatsApp:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  private setupEventHandlers(saveCreds: () => Promise<void>): void {
    if (!this.sock) return;

    // Handler de conexão
    this.sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📱 Escaneie o QR Code abaixo:');
        qrcode.generate(qr, { small: true });
        this.emit('qr', qr);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`🔌 Conexão fechada. Código: ${statusCode}. Reconectar: ${shouldReconnect}`);
        this.isReady = false;
        this.emit('disconnected', { reason: lastDisconnect?.error, shouldReconnect });

        if (shouldReconnect) {
          console.log('🔄 Tentando reconectar em 5s...');
          setTimeout(() => this.start(), 5000);
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp Conectado e Pronto!');
        this.isReady = true;
        this.isConnecting = false;
        this.emit('connected');
      }
    });

    // Salvar credenciais atualizadas
    this.sock.ev.on('creds.update', saveCreds);

    // Handler de mensagens recebidas
    this.sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === 'notify') {
        const parsed = this.parseMessage(msg);
        console.log(`📩 Mensagem de ${parsed.sender}: ${parsed.body}`);
        this.emit('message', parsed);

        // Comando simples de exemplo
        if (parsed.body === '!ping') {
          await this.sendMessage(parsed.sender, { text: 'Pong! 🏓' });
        }
      }
    });

    // Handler de presença (opcional)
    this.sock.ev.on('presence.update', (update) => {
      this.emit('presence', update);
    });
  }

  // ==================== ENVIO DE MENSAGENS ====================

  /**
   * Envia mensagem de texto
   */
  public async sendMessage(
    jid: string,
    content: string | AnyMessageContent,
    options?: { quoted?: WAMessage }
  ): Promise<MessageResponse> {
    this.validateConnection();

    const normalizedJid = this.normalizeJid(jid);

    const messageContent: AnyMessageContent = typeof content === 'string'
      ? { text: content }
      : content;

    try {
      const result = await this.sock!.sendMessage(
        normalizedJid,
        messageContent,
        options ? { quoted: options.quoted } : undefined
      );

      return {
        id: result?.key?.id || 'unknown',
        status: 'sent',
        timestamp: Date.now()
      };
    } catch (error: any) {
      console.error('❌ Erro ao enviar mensagem:', error);
      this.emit('error', { action: 'sendMessage', error, jid: normalizedJid });
      throw new Error(`Falha ao enviar mensagem: ${error.message}`);
    }
  }

  /**
   * Envia imagem
   */
  public async sendImage(
    jid: string,
    media: MediaMessage
  ): Promise<MessageResponse> {
    return this.sendMedia(jid, {
      image: typeof media.media === 'string'
        ? { url: media.media }
        : media.media,
      mimetype: media.mimetype,
      caption: media.caption,
      fileName: media.filename
    });
  }

  /**
   * Envia vídeo
   */
  public async sendVideo(
    jid: string,
    media: MediaMessage
  ): Promise<MessageResponse> {
    return this.sendMedia(jid, {
      video: typeof media.media === 'string'
        ? { url: media.media }
        : media.media,
      mimetype: media.mimetype,
      caption: media.caption,
      fileName: media.filename,
      gifPlayback: media.mimetype === 'image/gif'
    });
  }

  /**
   * Envia documento
   */
  public async sendDocument(
    jid: string,
    media: MediaMessage
  ): Promise<MessageResponse> {
    return this.sendMedia(jid, {
      document: typeof media.media === 'string'
        ? { url: media.media }
        : media.media,
      mimetype: media.mimetype,
      caption: media.caption,
      fileName: media.filename || 'document'
    });
  }

  /**
   * Envia áudio
   */
  public async sendAudio(
    jid: string,
    media: Omit<MediaMessage, 'filename'> & { ptt?: boolean }
  ): Promise<MessageResponse> {
    return this.sendMedia(jid, {
      audio: typeof media.media === 'string'
        ? { url: media.media }
        : media.media,
      mimetype: media.mimetype || 'audio/ogg; codecs=opus',
      ptt: media.ptt // Push-to-talk (nota de voz)
    });
  }

  /**
   * Método interno para envio de mídia
   */
  private async sendMedia(
    jid: string,
    content: AnyMessageContent
  ): Promise<MessageResponse> {
    this.validateConnection();
    const normalizedJid = this.normalizeJid(jid);

    try {
      const result = await this.sock!.sendMessage(normalizedJid, content);
      return {
        id: result?.key?.id || 'unknown',
        status: 'sent',
        timestamp: Date.now()
      };
    } catch (error: any) {
      console.error('❌ Erro ao enviar mídia:', error);
      this.emit('error', { action: 'sendMedia', error, jid: normalizedJid });
      throw new Error(`Falha ao enviar mídia: ${error.message}`);
    }
  }

  /**
   * Envia contato
   */
  public async sendContact(
    jid: string,
    contact: { name: string; number: string }
  ): Promise<MessageResponse> {
    this.validateConnection();

    const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.name}\nTEL;type=CELL;waid=${contact.number.replace(/\D/g, '')}:${contact.number}\nEND:VCARD`;

    return this.sendMessage(jid, {
      contacts: {
        displayName: contact.name,
        contacts: [{ vcard }]
      }
    });
  }

  /**
   * Envia localização
   */
  public async sendLocation(
    jid: string,
    location: { latitude: number; longitude: number; name?: string }
  ): Promise<MessageResponse> {
    this.validateConnection();

    return this.sendMessage(jid, {
      location: {
        degreesLatitude: location.latitude,
        degreesLongitude: location.longitude,
        name: location.name
      }
    });
  }

  /**
   * Envia lista de opções (menu interativo)
   */
  public async sendList(
    jid: string,
    title: string,
    description: string,
    buttonText: string,
    sections: Array<{ title: string; rows: Array<{ title: string; description: string; id: string }> }>
  ): Promise<MessageResponse> {
    this.validateConnection();

    return this.sendMessage(jid, {
      text: description,
      footer: title,
      templateButtons: sections.flatMap(section =>
        section.rows.map(row => ({
          index: 1,
          urlButton: undefined,
          callButton: undefined,
          quickReplyButton: {
            displayText: row.title,
            id: row.id
          }
        }))
      ),
      viewOnce: false
    } as any); // Type assertion para compatibilidade com listas
  }

  /**
   * Envia botões (se suportado pelo dispositivo)
   */
  public async sendButtons(
    jid: string,
    text: string,
    buttons: Array<{ id: string; text: string }>
  ): Promise<MessageResponse> {
    this.validateConnection();

    return this.sendMessage(jid, {
      text,
      footer: 'Escolha uma opção:',
      templateButtons: buttons.map((btn, i) => ({
        index: i + 1,
        urlButton: undefined,
        callButton: undefined,
        quickReplyButton: {
          displayText: btn.text,
          id: btn.id
        }
      }))
    } as any);
  }

  // ==================== GERENCIAMENTO DE MENSAGENS ====================

  /**
   * Marca mensagem como lida
   */
  public async markAsRead(jid: string, messageIds: string[]): Promise<void> {
    this.validateConnection();
    await this.sock!.readMessages(messageIds.map(id => ({ id, fromMe: false, remoteJid: jid })));
  }

  /**
  * Reage a uma mensagem
  */
  public async sendReaction(
    jid: string,
    messageId: string,
    reaction: string
  ): Promise<void> {
    this.validateConnection();

    // ✅ CORREÇÃO: Normalizar JID antes de usar
    const normalizedJid = this.normalizeJid(jid);

    await this.sock!.sendMessage(normalizedJid, {
      react: {
        text: reaction,
        key: {
          id: messageId,
          fromMe: false,
          remoteJid: normalizedJid  // ✅ Usar JID normalizado aqui também
        }
      }
    });
  }

  /**
   * Encaminha mensagem
   */
  public async forwardMessage(
    jid: string,
    message: WAMessage,
    options?: { forceForward?: boolean }
  ): Promise<MessageResponse> {
    this.validateConnection();
    // Substitua a linha ~405 por:
    const result = await (this.sock as any).forwardMessage(
      this.normalizeJid(jid),
      message,
      options
    );
    return {
      id: result?.key?.id || 'unknown',
      status: 'sent',
      timestamp: Date.now()
    };
  }

  /**
  * Deleta mensagem (para todos ou apenas para você)
  */
  public async deleteMessage(
    jid: string,
    messageId: string,
    onlyForMe: boolean = false
  ): Promise<void> {
    this.validateConnection();

    // ✅ CORREÇÃO: Normalizar JID antes de usar
    const normalizedJid = this.normalizeJid(jid);

    await this.sock!.sendMessage(normalizedJid, {
      delete: {
        id: messageId,
        fromMe: onlyForMe,
        remoteJid: normalizedJid,  // ✅ JID normalizado
        participant: onlyForMe ? undefined : normalizedJid  // ✅ JID normalizado
      }
    });
  }

  // ==================== UTILITÁRIOS ====================

  /**
   * Normaliza JID (adiciona @s.whatsapp.net se necessário)
   */
  public normalizeJid(jid: string): string {
    if (jid.includes('@')) return jid;
    const clean = jid.replace(/\D/g, '');
    return `${clean}@s.whatsapp.net`;
  }

  /**
 * Parseia mensagem recebida para formato simplificado
 */
  public parseMessage(msg: WAMessage): {
    id: string;
    sender: string;
    body: string;
    timestamp: number;
    isGroup: boolean;
    type: 'text' | 'media' | 'unknown';
    raw: WAMessage;
  } {
    const sender = jidNormalizedUser(msg.key.remoteJid || '');

    // Extrair corpo da mensagem (priorizando texto)
    const body = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption
      || msg.message?.documentMessage?.caption
      || '';

    // ✅ CORREÇÃO: Verificar todos os tipos de mensagem de texto
    const isText = !!(
      msg.message?.conversation ||
      msg.message?.extendedTextMessage ||
      msg.message?.listMessage ||
      msg.message?.buttonsResponseMessage ||
      msg.message?.templateButtonReplyMessage
    );

    // Verificar se é mídia
    const isMedia = !!(
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      msg.message?.audioMessage ||
      msg.message?.documentMessage ||
      msg.message?.stickerMessage
    );

    // Determinar tipo
    const type: 'text' | 'media' | 'unknown' = isText
      ? 'text'
      : isMedia
        ? 'media'
        : 'unknown';

    return {
      id: msg.key.id || '',
      sender,
      body,
      timestamp: msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now(),
      isGroup: sender.includes('@g.us'),
      type,
      raw: msg
    };
  }

  /**
   * Baixa mídia de uma mensagem
   */
  public async downloadMedia(
    message: WAMessage,
    outputPath?: string
  ): Promise<Buffer | string> {
    if (!this.sock) throw new Error('Cliente não conectado');

    const mediaBuffer = await downloadMediaMessage(
      message,
      'buffer',
      {},
      { logger: pino({ level: 'silent' }), reuploadRequest: this.sock!.updateMediaMessage }
    );

    if (outputPath) {
      this.fsAdapter.writeFileSync(outputPath, mediaBuffer);
      return outputPath;
    }

    return mediaBuffer;
  }

  /**
   * Verifica se número existe no WhatsApp
   */
  // Substitua o bloco da linha ~506 por:
  public async verifyNumber(jid: string): Promise<{ exists: boolean; jid?: string }> {
    this.validateConnection();
    const results = await this.sock!.onWhatsApp(jid);
    const result = results?.[0];

    return {
      exists: result?.exists || false,
      jid: result?.jid
    };
  }

  /**
   * Atualiza presença (digitando, gravando, online)
   */
  public async updatePresence(jid: string, presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'): Promise<void> {
    this.validateConnection();
    await this.sock!.sendPresenceUpdate(presence, this.normalizeJid(jid));
  }

  // ==================== GERENCIAMENTO DE CONEXÃO ====================

  /**
   * Disconnecta gracefulmente
   */
  public async disconnect(): Promise<void> {
    if (this.sock) {
      console.log('🔌 Desconectando do WhatsApp...');
      await this.sock.logout();
      this.sock = null;
      this.isReady = false;
      this.isConnecting = false;
      this.emit('disconnected', { reason: 'user_requested' });
    }
  }

  /**
   * Reconecta manualmente
   */
  public async reconnect(): Promise<void> {
    await this.disconnect();
    await this.start();
  }

  /**
   * Valida se está conectado antes de operações
   */
  private validateConnection(): void {
    if (!this.sock || !this.isReady) {
      throw new Error('Cliente WhatsApp não está pronto');
    }
  }

  // ==================== ESTADO E EVENTOS ====================

  // Sistema simples de eventos (pode ser substituído por EventEmitter)
  private listeners: Record<string, Function[]> = {};

  public on(event: 'connected' | 'disconnected' | 'qr' | 'message' | 'error' | 'presence', handler: Function): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  public off(event: string, handler: Function): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler);
    }
  }

  protected emit(event: string, data?: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(handler => handler(data));
    }
  }

  // Getters
  public getStatus(): boolean { return this.isReady; }
  public isConnectingStatus(): boolean { return this.isConnecting; }
  public getClient(): WASocket | null { return this.sock; }

  // Setters para testes
  public setReady(ready: boolean): void { this.isReady = ready; }
  public setClient(client: WASocket | null): void {
    this.sock = client;
  }
}

// Singleton para produção
export const whatsappService = new WhatsAppService();
export default WhatsAppService;