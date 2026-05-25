// src/__tests__/globalTeardown.ts
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown() {
  const instance: MongoMemoryServer = (global as any).__MONGOINSTANCE;
  
  if (instance) {
    await instance.stop();
    console.log('🧹 MongoDB Memory Server encerrado');
  }
  
  // Limpa a variável global
  (global as any).__MONGOINSTANCE = null;
}