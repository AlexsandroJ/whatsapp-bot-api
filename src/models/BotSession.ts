// src/models/BotSession.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IBotSession extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId: string; // UUID único para identificar a sessão
  name: string; // Nome amigável do bot
  phoneNumber?: string; // Número conectado (após auth)

  // Estado da conexão
  status: 'disconnected' | 'qr_ready' | 'connecting' | 'connected' | 'error';
  qrCode?: string; // QR Code atual (efêmero, limpo após uso)
  lastError?: string;

  // Credenciais criptografadas do Baileys
  creds?: Buffer; // Creds criptografados
  keys?: Map<string, any>; // Keys criptografadas (serializadas)

  // Metadata
  webhookUrl?: string;
  settings: {
    autoReply?: boolean;
    readMessages?: boolean;
    downloadMedia?: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
  lastConnectedAt?: Date;
}

const BotSessionSchema = new Schema<IBotSession>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: { type: String, required: true, trim: true },
  phoneNumber: {
    type: String,
    trim: true,
    validate: {
      validator: (v: string) => !v || /^\d+@s\.whatsapp\.net$/.test(v),
      message: 'Phone must be in JID format'
    }
  },

  // Estado
  status: {
    type: String,
    enum: ['disconnected', 'qr_ready', 'connecting', 'connected', 'error'],
    default: 'disconnected',
    index: true
  },
  qrCode: { type: String, default: null },
  lastError: { type: String, default: null },

  // Credenciais (criptografadas)
  creds: { type: Buffer, default: null },
  keys: { type: Schema.Types.Mixed, default: {} }, // Serializado como JSON string

  // Configurações
  webhookUrl: { type: String, default: null },
  settings: {
    autoReply: { type: Boolean, default: false },
    readMessages: { type: Boolean, default: false },
    downloadMedia: { type: Boolean, default: true }
  },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastConnectedAt: { type: Date, default: null }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_, ret) => {
      const { creds, keys, __v, ...safeRet } = ret;
      return safeRet;
    }
  }
});

// Índices para queries comuns
BotSessionSchema.index({ userId: 1, status: 1 });
BotSessionSchema.index({ sessionId: 1, status: 1 });

// Middleware para atualizar updatedAt
// ✅ Fallback seguro com type assertion
BotSessionSchema.pre('save', function (this: IBotSession, next: any) {
  this.updatedAt = new Date();
  (next as (err?: Error) => void)();
});

export const BotSession = mongoose.model<IBotSession>('BotSession', BotSessionSchema);
export default BotSession;