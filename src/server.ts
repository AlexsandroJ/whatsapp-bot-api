import os from 'os';
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
  





/*
// --- Monitoramento de Recursos (CPU e Memória) ---
// Função para formatar bytes em MB/GB de forma legível
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Função para calcular uso de CPU (média entre intervalos)
const getCPUUsage = (): Promise<number> => {
  return new Promise((resolve) => {
    const start = process.cpuUsage();
    const startTime = process.hrtime();
    
    setTimeout(() => {
      const end = process.cpuUsage(start);
      const elapsedTime = process.hrtime(startTime);
      
      // Calcula porcentagem de CPU usada neste intervalo
      const user = end.user / 1000; // microssegundos -> milissegundos
      const system = end.system / 1000;
      const elapsedMs = elapsedTime[0] * 1000 + elapsedTime[1] / 1e6;
      const cpuPercent = ((user + system) / elapsedMs / os.cpus().length) * 100;
      
      resolve(Math.min(100, Math.max(0, cpuPercent)));
    }, 100); // Intervalo curto para medição
  });
};

// Inicia o monitoramento a cada 10 segundos
setInterval(async () => {
  const mem = process.memoryUsage();
  const cpu = await getCPUUsage();
  
  console.log(`
📊 [MONITOR] ${new Date().toLocaleTimeString()}
   ├─ CPU: ${cpu.toFixed(1)}%
   ├─ Memória RSS: ${formatBytes(mem.rss)}
   ├─ Memória Heap: ${formatBytes(mem.heapUsed)} / ${formatBytes(mem.heapTotal)}
   └─ Vazamento? Heap growth: ${formatBytes(mem.heapUsed - mem.heapTotal * 0.5) > '0 MB' ? '⚠️' : '✅'}
  `.trim());
}, 1000); // Ajuste o intervalo conforme necessário

*/







}