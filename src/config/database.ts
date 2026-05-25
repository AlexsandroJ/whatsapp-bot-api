// src/config/database.ts
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoMemoryServer: MongoMemoryServer | null = null;

export const connectDB = async (): Promise<void> => {
  try {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const useInMemory = process.env.USE_IN_MEMORY_DB?.toLowerCase().trim();
    
    // Debug: mostra o que está sendo lido
    console.log(`[DB Debug] NODE_ENV: "${nodeEnv}", USE_IN_MEMORY_DB: "${useInMemory}"`);

    let mongoUri = process.env.MONGO_URI;

    // 🧪 MODO TESTE OU DESENVOLVIMENTO COM MEMÓRIA
    if (nodeEnv === 'test' || (nodeEnv === 'development' && useInMemory === 'true')) {
      
      if (!mongoMemoryServer) {
        console.log('🧪 Iniciando MongoDB em MEMÓRIA...');
        mongoMemoryServer = await MongoMemoryServer.create();
        mongoUri = mongoMemoryServer.getUri();
        console.log(`🧪 MongoDB em memória rodando em: ${mongoUri}`);
      } else {
        mongoUri = mongoMemoryServer.getUri();
        console.log('🧪 Reutilizando MongoDB em memória existente');
      }
      
    } else if (nodeEnv === 'development') {
      // 🟡 Desenvolvimento com MongoDB local
      mongoUri = mongoUri || 'mongodb://localhost:27017/whatsapp_bot_db';
      console.log(`🔧 Conectando ao MongoDB LOCAL: ${mongoUri}`);
      
    } else {
      // 🟢 Produção: exige MONGO_URI definida
      if (!mongoUri) {
        throw new Error('MONGO_URI é obrigatória em produção');
      }
      console.log('🚀 Conectando ao MongoDB de PRODUÇÃO');
    }

    await mongoose.connect(mongoUri!);
    console.log('✅ MongoDB Conectado com sucesso');
    
  } catch (error) {
    console.error('❌ Erro na conexão com MongoDB:', error);
    
    // Dicas úteis
    console.log('\n💡 Dicas para resolver:');
    console.log('   1. Para usar MongoDB em memória: USE_IN_MEMORY_DB=true no .env');
    console.log('   2. Para usar MongoDB local: inicie o serviço ou use Docker');
    console.log('   3. Docker: docker run -d -p 27017:27017 mongo:7.0\n');
    
    process.exit(1);
  }
};

// Função para fechar conexão
export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
    mongoMemoryServer = null;
    console.log('🧹 MongoDB em memória encerrado');
  }
};