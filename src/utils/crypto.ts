// src/utils/crypto.ts
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits para GCM
const TAG_LENGTH = 16; // 128 bits

// Chave derivada do JWT_SECRET (em produção, use uma chave dedicada)
const deriveKey = (secret: string): Buffer => {
  return crypto.createHash('sha256').update(secret).digest().slice(0, KEY_LENGTH);
};

export const encryptData = (data: Buffer | string, secret: string): Buffer => {
  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const input = typeof data === 'string' ? Buffer.from(data) : data;
  const encrypted = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // Formato: [iv (12b)][tag (16b)][encrypted data]
  return Buffer.concat([iv, tag, encrypted]);
};

export const decryptData = (encrypted: Buffer, secret: string): Buffer => {
  const key = deriveKey(secret);
  
  // Extrair componentes
  const iv = encrypted.slice(0, IV_LENGTH);
  const tag = encrypted.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = encrypted.slice(IV_LENGTH + TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  return Buffer.concat([decipher.update(data), decipher.final()]);
};

export const serializeKeys = (keys: Map<string, any>): string => {
  // Converte Map para objeto serializável
  const obj: Record<string, any> = {};
  keys.forEach((value, key) => {
    obj[key] = value;
  });
  return JSON.stringify(obj);
};

export const deserializeKeys = (json: string): Map<string, any> => {
  const obj = JSON.parse(json);
  return new Map(Object.entries(obj));
};