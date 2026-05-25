// src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import { Request } from 'express';

export const sessionRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições por sessão
  keyGenerator: (req: Request) => {
    // ✅ Agora req.user é reconhecido pelo TypeScript
    const userId = req.user?.id?.toString() || 'anonymous';
    const sessionId = req.params.sessionId || 'global';
    return `${userId}:${sessionId}`;
  },
  message: {
    success: false,
    message: 'Muitas requisições. Tente novamente mais tarde.'
  },
  standardHeaders: true,
  legacyHeaders: false
});