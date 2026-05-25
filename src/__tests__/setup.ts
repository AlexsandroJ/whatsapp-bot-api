// src/__tests__/setup.ts
/// <reference types="jest" />

import mongoose from 'mongoose';

beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test') {
    process.env.NODE_ENV = 'test';
  }

  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI não definida');
    
    await mongoose.connect(uri, { 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000
    });
  }
});

afterEach(async () => {
  try {
    if (mongoose.connection.readyState !== 1) return;
    if (!mongoose.connection.db) return;

    // ✅ CORREÇÃO: Adicionar .unref() para não bloquear o Jest
    const timeoutId = setTimeout(() => {
      // Não faz nada, só para o Promise.race rejeitar
    }, 1000);
    timeoutId.unref(); // ← ✅ Não mantém o processo vivo

    await Promise.race([
      (async () => {
        const collections = await mongoose.connection.db!.collections();
        for (const collection of collections) {
          await collection.deleteMany({});
        }
      })(),
      new Promise((_, reject) => {
        timeoutId.unref(); // ← ✅ Garantir unref também aqui
        reject(new Error('Cleanup timeout'));
      })
    ]);
    
    // Limpa o timer se ainda estiver pendente
    clearTimeout(timeoutId);
  } catch {
    // Ignora erros de cleanup para não falhar testes
  }
});

afterAll(async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      // ✅ CORREÇÃO: Timeout com .unref()
      const timeoutId = setTimeout(() => {
        // No-op
      }, 2000);
      timeoutId.unref();
      
      await Promise.race([
        mongoose.disconnect(),
        new Promise((_, reject) => {
          timeoutId.unref();
          reject(new Error('Disconnect timeout'));
        })
      ]);
      
      clearTimeout(timeoutId);
    }
  } catch {
    // Fallback agressivo
    try {
      mongoose.connection.removeAllListeners();
      await mongoose.connection.close(true);
    } catch {
      // Ignora
    }
  }
  
  // ✅ Limpa qualquer timer restante
  jest.clearAllTimers?.();
  
  if (mongoose.connection.readyState !== 0) {
    mongoose.connection.destroy?.();
  }
});