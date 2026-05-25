import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/database';
import authRoutes from './routes/AuthRoutes';
import botRoutes from './routes/BotRoutes';
import sessionRoutes from './routes/SessionRoutes'; // Novas rotas multi-sessão
// ✅ IMPORTAÇÃO ADICIONADA (O Jest irá mockar isso nos testes)
import { whatsappService } from './services/WhatsAppService';

dotenv.config();

const app = express();
export default app; // Exporta 'app' para os testes conseguirem usar com supertest

const PORT = process.env.PORT || 3000;

// --- Middlewares de Segurança ---
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check (público)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rate Limiting Global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // limite de 100 requisições por IP
});
app.use('/api/', limiter);

// --- Rotas ---
app.use('/api/auth', authRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/sessions', sessionRoutes);
// Error handler global
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Erro não tratado:', err);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno no servidor'
  });
});
// Health Check
app.get('/', (req, res) => {
  res.json({ message: 'API WhatsApp Bot Rodando' });
});



// --- Inicialização do Servidor ---
// Este bloco só executa se rodarmos 'node dist/server.js' diretamente.
// Se o arquivo for importado (ex: nos testes), isso é ignorado.
if (require.main === module) {
    async function startServer() {
    try {
      await connectDB();
      
      console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 MongoDB URI: ${process.env.MONGO_URI ? 'Configurada' : 'Não definida'}`);
      
      // Inicia o serviço do WhatsApp
      // Nos testes, como mockamos esse serviço, essa chamada será segura e rápida
      await whatsappService.start();
      
      app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando na porta ${PORT}`);
      });
    } catch (error) {
      console.error('❌ Falha ao iniciar o servidor:', error);
      process.exit(1);
    }
  }
  startServer();
}