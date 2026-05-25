// src/__tests__/globalSetup.ts
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
  // Força NODE_ENV=test durante os testes
  process.env.NODE_ENV = 'test';
  
  const instance = await MongoMemoryServer.create();
  const uri = instance.getUri();
  
  // Salva a instância e a URI para uso global
  (global as any).__MONGOINSTANCE = instance;
  process.env.MONGO_URI = uri;
  
  console.log(`🧪 MongoDB Memory Server iniciado em: ${uri}`);
}