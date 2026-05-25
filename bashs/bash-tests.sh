#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Configurando ambiente de testes para WhatsApp Bot API...${NC}"

# 1. Instalação de Dependências de Teste
echo -e "${YELLOW}Instalando dependências de teste (Jest, Supertest, Mongo Memory Server)...${NC}"
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest mongodb-memory-server

# 2. Configuração do Jest
echo "Criando configuração do Jest..."
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  globalSetup: '<rootDir>/src/__tests__/globalSetup.ts',
  globalTeardown: '<rootDir>/src/__tests__/globalTeardown.ts',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts', // Não cobrir o entry point principal
    '!src/__tests__/**'
  ]
};
EOF

# 3. Criar Pasta de Testes
mkdir -p src/__tests__

# 4. Arquivos de Configuração Global do Teste (MongoDB Em Memória)

# globalSetup.ts
cat > src/__tests__/globalSetup.ts << 'EOF'
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
  const instance = await MongoMemoryServer.create();
  const uri = instance.getUri();
  
  // Salva a URI no processo para ser usada pelo Mongoose
  (global as any).__MONGOINSTANCE = instance;
  process.env.MONGO_URI = uri;
}
EOF

# globalTeardown.ts
cat > src/__tests__/globalTeardown.ts << 'EOF'
import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalTeardown() {
  const instance: MongoMemoryServer = (global as any).__MONGOINSTANCE;
  if (instance) {
    await instance.stop();
  }
}
EOF

# setup.ts (Limpeza entre testes)
cat > src/__tests__/setup.ts << 'EOF'
import mongoose from 'mongoose';

// Conecta ao DB antes de cada suite de testes se necessário, 
// mas o Mongoose já deve estar conectado via app initialization ou mock
beforeAll(async () => {
    // Garante que não há conexões pendentes
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGO_URI!);
    }
});

afterEach(async () => {
    // Limpa todas as coleções após cada teste para isolamento
    if (mongoose.connection.db) {
        const collections = await mongoose.connection.db.collections();
        for (let collection of collections) {
            await collection.deleteMany({});
        }
    }
});

afterAll(async () => {
    await mongoose.disconnect();
});
EOF

# 5. Mock do Serviço WhatsApp (Para não precisar escanear QR Code nos testes)
# Criamos um mock manual para o WhatsAppService
mkdir -p src/__mocks__
cat > src/__mocks__/WhatsAppServiceMock.ts << 'EOF'
// Mock simples para simular o comportamento do WhatsAppService
export const mockWhatsAppService = {
  start: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn().mockResolvedValue({ id: 'msg_123', status: 'sent' }),
  getStatus: jest.fn().mockReturnValue(true), // Assume sempre conectado nos testes
  getClient: jest.fn().mockReturnValue(null)
};

// Para usar no Jest, você pode substituir o módulo real por este mock
// ou injetar essa dependência via Injeção de Dependência no futuro.
// Neste exemplo, vamos usar jest.mock no arquivo de teste.
EOF

# 6. Casos de Teste

# Auth Controller Tests
cat > src/__tests__/auth.test.ts << 'EOF'
import request from 'supertest';
import app from '../server'; // Precisamos exportar o app do server.ts
import User from '../models/User';

// Nota: Para isso funcionar, precisamos ajustar o src/server.ts para exportar 'app'
// Veja a instrução abaixo no script sobre como ajustar o server.ts

describe('Auth API', () => {
  const userData = {
    username: 'testuser',
    password: 'password123'
  };

  it('Deve registrar um novo usuário', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(userData);
    
    expect(res.statusCode).toEqual(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.username).toBe(userData.username);
  });

  it('Não deve registrar usuário duplicado', async () => {
    // Primeiro registra
    await request(app).post('/api/auth/register').send(userData);
    
    // Tenta registrar novamente
    const res = await request(app)
      .post('/api/auth/register')
      .send(userData);
    
    expect(res.statusCode).toEqual(400);
    expect(res.body.message).toMatch(/já existe/i);
  });

  it('Deve fazer login com credenciais válidas', async () => {
    // Registra primeiro
    await request(app).post('/api/auth/register').send(userData);

    const res = await request(app)
      .post('/api/auth/login')
      .send(userData);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body).toHaveProperty('token');
  });

  it('Não deve fazer login com senha errada', async () => {
     // Registra primeiro
     await request(app).post('/api/auth/register').send(userData);

     const res = await request(app)
       .post('/api/auth/login')
       .send({ username: userData.username, password: 'wrongpass' });
     
     expect(res.statusCode).toEqual(401);
  });
});
EOF

# Bot Controller Tests
cat > src/__tests__/bot.test.ts << 'EOF'
import request from 'supertest';
import app from '../server';
import User from '../models/User';
import { whatsappService } from '../services/WhatsAppService';

// Mock do serviço WhatsApp para evitar conexão real
jest.mock('../services/WhatsAppService', () => ({
  whatsappService: {
    start: jest.fn(),
    getStatus: jest.fn(() => true), // Simula que está online
    sendMessage: jest.fn().mockResolvedValue({ id: 'mock_msg_id' })
  }
}));

describe('Bot API', () => {
  let token: string;
  const userData = {
    username: 'botuser',
    password: 'password123'
  };

  beforeAll(async () => {
    // Cria usuário e obtém token para autenticação nas rotas protegidas
    await request(app).post('/api/auth/register').send(userData);
    const loginRes = await request(app).post('/api/auth/login').send(userData);
    token = loginRes.body.token;
  });

  it('Deve retornar status do bot', async () => {
    const res = await request(app)
      .get('/api/bot/status')
      .set('Authorization', `Bearer ${token}`);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.connected).toBe(true);
  });

  it('Deve enviar mensagem de texto', async () => {
    const messageData = {
      number: '5511999999999',
      message: 'Olá teste!'
    };

    const res = await request(app)
      .post('/api/bot/send-text')
      .set('Authorization', `Bearer ${token}`)
      .send(messageData);
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBe(true);
    
    // Verifica se o método do mock foi chamado
    expect(whatsappService.sendMessage).toHaveBeenCalledWith(
      messageData.number,
      { text: messageData.message }
    );
  });

  it('Não deve enviar mensagem sem autenticação', async () => {
    const res = await request(app)
      .post('/api/bot/send-text')
      .send({ number: '5511999999999', message: 'Teste' });
    
    expect(res.statusCode).toEqual(401);
  });
  
  it('Não deve enviar mensagem se número ou texto faltarem', async () => {
      const res = await request(app)
        .post('/api/bot/send-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ number: '5511999999999' }); // Falta message
      
      expect(res.statusCode).toEqual(400);
  });
});
EOF

# 7. Ajuste Crítico no src/server.ts
# Precisamos exportar o 'app' para o Supertest conseguir usar, 
# mas manter o 'listen' apenas se for executado diretamente.
echo -e "${YELLOW}Ajustando src/server.ts para suportar testes...${NC}"

cat > src/server.ts << 'EOF'
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/database';
import authRoutes from './routes/AuthRoutes';
import botRoutes from './routes/BotRoutes';
import { whatsappService } from './services/WhatsAppService';

dotenv.config();

const app = express();
export default app; // Exporta para testes

const PORT = process.env.PORT || 3000;

// Segurança e Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate Limiting Global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de 100 requisições por IP
});
app.use('/api/', limiter);

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/bot', botRoutes);

// Health Check
app.get('/', (req, res) => {
  res.json({ message: 'API WhatsApp Bot Rodando' });
});

// Inicialização apenas se este arquivo for executado diretamente (não em import/testes)
if (require.main === module) {
  async function startServer() {
    await connectDB();
    
    // Inicia o serviço do WhatsApp em background
    whatsappService.start().catch(err => console.error("Erro ao iniciar WhatsApp:", err));

    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
    });
  }
  startServer();
}
EOF

echo -e "${GREEN}Configuração de testes concluída!${NC}"
echo "Para rodar os testes, execute:"
echo -e "${YELLOW}npm test${NC}"
echo ""
echo "Observações:"
echo "1. Os testes usam um MongoDB em memória, então seus dados locais estão seguros."
echo "2. O serviço do WhatsApp foi 'mockado' nos testes para não exigir QR Code."
echo "3. O arquivo src/server.ts foi atualizado para permitir imports sem iniciar o servidor TCP."