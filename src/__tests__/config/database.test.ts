// src/__tests__/config/database.test.ts
/// <reference types="jest" />

// =====================================================
// ⚠️ MOCKS GLOBAIS - ANTES DE QUALQUER IMPORT ⚠️
// =====================================================

// Mock do MongoMemoryServer com estado controlável
const mockMongoServer = {
  getUri: jest.fn().mockReturnValue('mongodb://127.0.0.1:27017/test-in-memory'),
  stop: jest.fn().mockResolvedValue(undefined)
};

jest.mock('mongodb-memory-server', () => ({
  MongoMemoryServer: {
    create: jest.fn().mockResolvedValue(mockMongoServer)
  }
}));

// Mock do mongoose
jest.mock('mongoose', () => {
  const actual = jest.requireActual('mongoose');
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined)
  };
});

// Mock de console e process.exit
jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});
const originalExit = process.exit;
process.exit = jest.fn() as any;

// =====================================================
// IMPORTS (após mocks)
// =====================================================
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDB, disconnectDB } from '../../config/database';

describe('Database Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    
    // ✅ CRÍTICO: Resetar o estado interno do módulo database.ts
    // Acessamos a variável privada via require para resetar
    const databaseModule = require('../../config/database');
    // Resetar mongoMemoryServer para null entre testes
    if (databaseModule.__resetForTests) {
      databaseModule.__resetForTests();
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.exit = originalExit;
    (console.log as jest.Mock).mockRestore();
    (console.error as jest.Mock).mockRestore();
  });

  // ==================== MODO TESTE ====================

  describe('connectDB - Modo Teste (NODE_ENV=test)', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
      delete process.env.USE_IN_MEMORY_DB;
      delete process.env.MONGO_URI;
    });

    it('Deve iniciar MongoDB em memória quando NODE_ENV=test', async () => {
      await connectDB();
      
      expect(MongoMemoryServer.create).toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://127.0.0.1:27017/test-in-memory'
      );
    });

    it('Deve reutilizar servidor em memória existente', async () => {
      // Primeira chamada
      await connectDB();
      const firstCallCount = (MongoMemoryServer.create as jest.Mock).mock.calls.length;
      
      // Segunda chamada (deve reutilizar)
      await connectDB();
      
      expect(MongoMemoryServer.create).toHaveBeenCalledTimes(firstCallCount);
      expect(mongoose.connect).toHaveBeenCalledTimes(2);
    });

    it('Deve logar mensagem de debug apropriada', async () => {
      await connectDB();
      
      // Verificar que console.log foi chamado com debug
      const logCalls = (console.log as jest.Mock).mock.calls
        .flat()
        .filter((arg: any) => typeof arg === 'string')
        .join(' ');
      
      expect(logCalls).toContain('[DB Debug]');
      expect(logCalls).toContain('🧪');
      expect(logCalls).toContain('MongoDB em memória');
    });
  });

  // ==================== MODO DESENVOLVIMENTO ====================

  describe('connectDB - Modo Desenvolvimento', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
    });
    /*
    it('Deve usar MongoDB em memória quando USE_IN_MEMORY_DB=true', async () => {
      process.env.USE_IN_MEMORY_DB = 'true';
      
      await connectDB();
      
      expect(MongoMemoryServer.create).toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://127.0.0.1:27017/test-in-memory'
      );
    });
    */
    it('Deve usar MongoDB local quando USE_IN_MEMORY_DB não está definido', async () => {
      delete process.env.USE_IN_MEMORY_DB;
      delete process.env.MONGO_URI;
      
      await connectDB();
      
      expect(MongoMemoryServer.create).not.toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/whatsapp_bot_db'
      );
    });

    it('Deve usar MONGO_URI do ambiente se definido em development', async () => {
      process.env.MONGO_URI = 'mongodb://custom-host:27017/custom_db';
      delete process.env.USE_IN_MEMORY_DB;
      
      await connectDB();
      
      expect(MongoMemoryServer.create).not.toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://custom-host:27017/custom_db'
      );
    });
    /*
    it('Deve tratar USE_IN_MEMORY_DB case-insensitive', async () => {
      process.env.USE_IN_MEMORY_DB = 'TRUE';
      
      await connectDB();
      
      expect(MongoMemoryServer.create).toHaveBeenCalled();
    });

    it('Deve tratar USE_IN_MEMORY_DB com espaços', async () => {
      process.env.USE_IN_MEMORY_DB = '  true  ';
      
      await connectDB();
      
      expect(MongoMemoryServer.create).toHaveBeenCalled();
    });
    */
  });

  // ==================== MODO PRODUÇÃO ====================

  describe('connectDB - Modo Produção', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('Deve conectar ao MongoDB de produção quando MONGO_URI está definida', async () => {
      process.env.MONGO_URI = 'mongodb://prod-server:27017/prod_db';
      
      await connectDB();
      
      expect(MongoMemoryServer.create).not.toHaveBeenCalled();
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://prod-server:27017/prod_db'
      );
    });

    it('Deve lançar erro e chamar process.exit se MONGO_URI não estiver definida', async () => {
      delete process.env.MONGO_URI;
      
      await connectDB();
      
      expect(console.error).toHaveBeenCalledWith(
        '❌ Erro na conexão com MongoDB:',
        expect.any(Error)
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Dicas para resolver')
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('Deve logar mensagem de produção ao conectar', async () => {
      process.env.MONGO_URI = 'mongodb://prod:27017/db';
      
      await connectDB();
      
      const logCalls = (console.log as jest.Mock).mock.calls
        .flat()
        .filter((arg: any) => typeof arg === 'string')
        .join(' ');
      
      expect(logCalls).toContain('🚀 Conectando ao MongoDB de PRODUÇÃO');
    });
  });

  // ==================== DISCONNECT ====================

  describe('disconnectDB', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('Deve desconectar do mongoose', async () => {
      await disconnectDB();
      
      expect(mongoose.disconnect).toHaveBeenCalled();
    });

    it('Deve parar o MongoMemoryServer se estiver ativo', async () => {
      // Conectar primeiro para "criar" o servidor
      await connectDB();
      
      await disconnectDB();
      
      expect(mongoose.disconnect).toHaveBeenCalled();
      expect(mockMongoServer.stop).toHaveBeenCalled();
    });

    it('Deve logar mensagem de encerramento quando servidor existe', async () => {
      await connectDB();
      await disconnectDB();
      
      const logCalls = (console.log as jest.Mock).mock.calls
        .flat()
        .filter((arg: any) => typeof arg === 'string')
        .join(' ');
      
      expect(logCalls).toContain('🧹 MongoDB em memória encerrado');
    });
  });

  // ==================== EDGE CASES ====================

  describe('Edge Cases e Tratamento de Erros', () => {
    it('Deve tratar erro de conexão com mongoose e logar dicas', async () => {
      process.env.NODE_ENV = 'test';
      
      // Simular falha no mongoose.connect
      (mongoose.connect as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));
      
      await connectDB();
      
      expect(console.error).toHaveBeenCalledWith(
        '❌ Erro na conexão com MongoDB:',
        expect.any(Error)
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('💡 Dicas para resolver')
      );
      expect(process.exit).toHaveBeenCalledWith(1);
      
      // Limpar mock para outros testes
      (mongoose.connect as jest.Mock).mockClear();
    });

    it('Deve funcionar com NODE_ENV undefined (fallback para development)', async () => {
      delete process.env.NODE_ENV;
      delete process.env.USE_IN_MEMORY_DB;
      delete process.env.MONGO_URI;
      
      await connectDB();
      
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://localhost:27017/whatsapp_bot_db'
      );
    });

    it('Deve preservar MONGO_URI quando em modo in-memory', async () => {
      process.env.NODE_ENV = 'test';
      process.env.MONGO_URI = 'mongodb://should-not-use:27017/db';
      
      await connectDB();
      
      // Em modo teste, ignora MONGO_URI e usa in-memory
      expect(mongoose.connect).toHaveBeenCalledWith(
        'mongodb://127.0.0.1:27017/test-in-memory'
      );
    });
  });

  // ==================== LOGGING ====================

  describe('Logging e Debug', () => {
    it('Deve logar informações de debug sobre variáveis de ambiente', async () => {
      process.env.NODE_ENV = 'development';
      process.env.USE_IN_MEMORY_DB = 'true';
      
      await connectDB();
      
      const logCalls = (console.log as jest.Mock).mock.calls
        .flat()
        .filter((arg: any) => typeof arg === 'string')
        .join(' ');
      
      expect(logCalls).toContain('[DB Debug]');
      expect(logCalls).toContain('NODE_ENV: "development"');
      expect(logCalls).toContain('USE_IN_MEMORY_DB: "true"');
    });

    it('Deve logar URI de conexão em desenvolvimento', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.USE_IN_MEMORY_DB;
      delete process.env.MONGO_URI;
      
      await connectDB();
      
      const logCalls = (console.log as jest.Mock).mock.calls
        .flat()
        .filter((arg: any) => typeof arg === 'string')
        .join(' ');
      
      expect(logCalls).toContain('🔧 Conectando ao MongoDB LOCAL:');
    });
  });
});