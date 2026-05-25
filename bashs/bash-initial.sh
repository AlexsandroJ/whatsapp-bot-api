#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}Iniciando a criação da estrutura do Projeto WhatsApp Bot API (Baileys + TS + Mongo)...${NC}"

# Nome do projeto
PROJECT_NAME="whatsapp-bot-api"
mkdir -p $PROJECT_NAME
cd $PROJECT_NAME

# 1. Inicialização do NPM e Instalação de Dependências
echo "Inicializando npm e instalando dependências..."
npm init -y > /dev/null 2>&1

# Dependências de Produção
npm install express mongoose dotenv @whiskeysockets/baileys qrcode-terminal pino helmet cors express-rate-limit jsonwebtoken bcryptjs uuid > /dev/null 2>&1

# Dependências de Desenvolvimento
npm install --save-dev typescript @types/node @types/express @types/cors @types/jsonwebtoken @types/bcryptjs ts-node-dev nodemon > /dev/null 2>&1

# 2. Criação de Pastas
echo "Criando estrutura de diretórios..."
mkdir -p src/config
mkdir -p src/controllers
mkdir -p src/routes
mkdir -p src/services
mkdir -p src/models
mkdir -p src/middleware
mkdir -p src/utils
mkdir -p uploads # Para armazenar mídias se necessário

# 3. Arquivos de Configuração

# .env
cat > .env << 'EOF'
PORT=3000
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/whatsapp_bot_db

# Segurança
JWT_SECRET=super_secret_jwt_key_change_this_in_production
API_KEY=your_secure_api_key_change_this

# Sessão Baileys (Nome da pasta ou collection no mongo se adaptar)
SESSION_NAME=my_bot_session
EOF

# tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# package.json scripts update
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json'));
pkg.scripts = {
  \"build\": \"tsc\",
  \"start\": \"node dist/server.js\",
  \"dev\": \"ts-node-dev --respawn --transpile-only src/server.ts\"
};
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# 4. Código Fonte

# src/config/database.ts
cat > src/config/database.ts << 'EOF'
import mongoose from 'mongoose';

export const connectDB = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/whatsapp_bot_db';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Conectado com sucesso');
  } catch (error) {
    console.error('❌ Erro na conexão com MongoDB:', error);
    process.exit(1);
  }
};
EOF

# src/models/Session.ts (Para salvar estado do Baileys se quiser usar MongoAdapter, mas usaremos LocalAuth simplificado aqui)
# Vamos criar um Model de Usuário/Admin para autenticação na API
cat > src/models/User.ts << 'EOF'
import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  password: string;
  role: 'admin' | 'user';
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' }
}, { timestamps: true });

UserSchema.pre<IUser>('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
EOF

# src/models/MessageLog.ts (Para auditar mensagens enviadas/recebidas)
cat > src/models/MessageLog.ts << 'EOF'
import mongoose, { Document, Schema } from 'mongoose';

export interface IMessageLog extends Document {
  jid: string;
  direction: 'in' | 'out';
  content: string;
  timestamp: Date;
  status?: string;
}

const MessageLogSchema: Schema = new Schema({
  jid: { type: String, required: true, index: true },
  direction: { type: String, enum: ['in', 'out'], required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'processed' }
}, { timestamps: true });

export default mongoose.model<IMessageLog>('MessageLog', MessageLogSchema);
EOF

# src/utils/auth.ts (Helpers de JWT)
cat > src/utils/auth.ts << 'EOF'
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'secret';

export const generateToken = (userId: string): string => {
  return jwt.sign({ id: userId }, SECRET, { expiresIn: '1d' });
};

export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, SECRET);
  } catch (error) {
    return null;
  }
};
EOF

# src/middleware/auth.ts (Middleware de Proteção)
cat > src/middleware/auth.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';

// Middleware para proteger rotas com JWT
export const protectRoute = (req: Request, res: Response, next: NextFunction) => {
  let token = '';
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Não autorizado, nenhum token' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Token inválido ou expirado' });
  }

  // @ts-ignore
  req.user = decoded;
  next();
};

// Middleware para proteção simples por API Key (para serviços externos)
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  const validApiKey = process.env.API_KEY;

  if (!apiKey || apiKey !== validApiKey) {
    return res.status(403).json({ success: false, message: 'Chave de API inválida ou ausente' });
  }
  next();
};
EOF

# src/services/WhatsAppService.ts (O Coração do Baileys)
cat > src/services/WhatsAppService.ts << 'EOF'
import makeWASocket, { DisconnectReason, useMultiFileAuthState, WASocket, AnyMessageContent } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import fs from 'fs';
import path from 'path';

class WhatsAppService {
  private sock: WASocket | null = null;
  private isReady: boolean = false;
  private sessionPath: string;

  constructor() {
    this.sessionPath = path.join(__dirname, '../../auth_info_baileys');
    // Garante que a pasta exista
    if (!fs.existsSync(this.sessionPath)){
        fs.mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  public async start(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      logger: pino({ level: 'silent' }),
      browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📱 Escaneie o QR Code abaixo:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('Conexão fechada. Reconectando?', shouldReconnect);
        if (shouldReconnect) {
          this.start();
        }
      } else if (connection === 'open') {
        console.log('✅ WhatsApp Conectado e Pronto!');
        this.isReady = true;
      }
    });

    this.sock.ev.on('creds.update', saveCreds);

    // Listener de Mensagens
    this.sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === 'notify') {
        const sender = msg.key.remoteJid;
        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        
        console.log(`📩 Mensagem de ${sender}: ${body}`);
        
        // Lógica simples de eco/resposta automática pode ser injetada aqui
        // Ou emitida via EventEmitter para o Controller lidar
        if (body === '!ping') {
             await this.sendMessage(sender!, { text: 'Pong! 🏓' });
        }
      }
    });
  }

  public async sendMessage(jid: string, content: AnyMessageContent): Promise<any> {
    if (!this.sock || !this.isReady) {
      throw new Error('Cliente WhatsApp não está pronto');
    }
    // Adiciona @s.whatsapp.net se for número puro
    if (!jid.includes('@')) {
        jid = jid.replace(/\D/g, '') + '@s.whatsapp.net';
    }
    return this.sock.sendMessage(jid, content);
  }

  public getStatus(): boolean {
    return this.isReady;
  }
  
  public getClient(): WASocket | null {
      return this.sock;
  }
}

// Singleton
export const whatsappService = new WhatsAppService();
EOF

# src/controllers/AuthController.ts
cat > src/controllers/AuthController.ts << 'EOF'
import { Request, Response } from 'express';
import User from '../models/User';
import { generateToken } from '../utils/auth';

export const register = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Preencha todos os campos' });
    }
    
    const userExists = await User.findOne({ username });
    if (userExists) {
      return res.status(400).json({ success: false, message: 'Usuário já existe' });
    }

    const user = await User.create({ username, password });
    const token = generateToken(user.id);

    res.status(201).json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }

    const token = generateToken(user.id);
    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
EOF

# src/controllers/BotController.ts
cat > src/controllers/BotController.ts << 'EOF'
import { Request, Response } from 'express';
import { whatsappService } from '../services/WhatsAppService';
import MessageLog from '../models/MessageLog';

export const sendText = async (req: Request, res: Response) => {
  try {
    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({ success: false, message: 'Número e mensagem são obrigatórios' });
    }

    if (!whatsappService.getStatus()) {
      return res.status(503).json({ success: false, message: 'Bot WhatsApp não está conectado' });
    }

    await whatsappService.sendMessage(number, { text: message });
    
    // Log da mensagem
    await MessageLog.create({
        jid: number,
        direction: 'out',
        content: message
    });

    res.json({ success: true, message: 'Mensagem enviada com sucesso' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getStatus = (req: Request, res: Response) => {
  const isReady = whatsappService.getStatus();
  res.json({ 
      success: true, 
      connected: isReady,
      status: isReady ? 'online' : 'offline/disconnecting' 
  });
};
EOF

# src/routes/AuthRoutes.ts
cat > src/routes/AuthRoutes.ts << 'EOF'
import { Router } from 'express';
import { register, login } from '../controllers/AuthController';

const router = Router();

router.post('/register', register);
router.post('/login', login);

export default router;
EOF

# src/routes/BotRoutes.ts
cat > src/routes/BotRoutes.ts << 'EOF'
import { Router } from 'express';
import { sendText, getStatus } from '../controllers/BotController';
import { protectRoute } from '../middleware/auth';
import { apiKeyAuth } from '../middleware/auth';

const router = Router();

// Protegido por JWT (para usuários do sistema)
router.get('/status', protectRoute, getStatus);
router.post('/send-text', protectRoute, sendText);

// Alternativa: Protegido por API Key (para integrações externas simples)
// router.post('/send-text-key', apiKeyAuth, sendText);

export default router;
EOF

# src/server.ts
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

// Inicialização
async function startServer() {
  await connectDB();
  
  // Inicia o serviço do WhatsApp em background
  whatsappService.start().catch(err => console.error("Erro ao iniciar WhatsApp:", err));

  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
  });
}

startServer();
EOF

echo -e "${GREEN}Estrutura gerada com sucesso na pasta '$PROJECT_NAME'!${NC}"
echo "Próximos passos:"
echo "1. cd $PROJECT_NAME"
echo "2. Edite o arquivo .env com suas configurações (MONGO_URI, JWT_SECRET, API_KEY)"
echo "3. Execute 'npm run dev' para iniciar em modo desenvolvimento"
echo "4. Use Postman ou Curl para testar as rotas /api/auth/register e /api/auth/login"
echo "5. Use o token recebido para acessar /api/bot/send-text"