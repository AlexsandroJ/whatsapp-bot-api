// src/models/MessageLog.ts
import mongoose, { Document, Schema } from 'mongoose';

// ✅ Interface para tipagem TypeScript
export interface IMessageLog extends Document {
  direction: 'inbound' | 'outbound';
  // ✅ CORREÇÃO: Adicionar 'ptt' aos tipos válidos
  type: 'text' | 'image' | 'video' | 'audio' | 'ptt' | 'document' | 'contact' | 'location' | 'list' | 'buttons';
  sender?: string;
  recipient?: string;
  content: string;
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// ✅ Schema do Mongoose
const MessageLogSchema = new Schema<IMessageLog>({
  direction: { 
    type: String, 
    required: true, 
    enum: ['inbound', 'outbound'] 
  },
  type: { 
    type: String, 
    required: true,
    // ✅ CORREÇÃO: Adicionar 'ptt' ao enum
    enum: ['text', 'image', 'video', 'audio', 'ptt', 'document', 'contact', 'location', 'list', 'buttons']
  },
  sender: String,
  recipient: String,
  content: { type: String, required: true },
  messageId: { type: String, required: true, index: true },
  status: { 
    type: String, 
    required: true, 
    enum: ['sent', 'delivered', 'read', 'failed', 'pending'] 
  },
  metadata: Schema.Types.Mixed,
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ✅ Índices para consultas eficientes
MessageLogSchema.index({ messageId: 1 });
MessageLogSchema.index({ createdAt: -1 });
MessageLogSchema.index({ direction: 1, type: 1 });

// ✅ Model do Mongoose
const MessageLogModel = mongoose.model<IMessageLog>('MessageLog', MessageLogSchema);

// ✅ Exports
export { MessageLogModel as MessageLog };
export default MessageLogModel;