// src/__tests__/utils/testApp.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import botRoutes from '../../routes/BotRoutes';

// Middleware de auth MOCKADO para testes
const testAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path.includes('/health')) return next();
  
  const token = req.headers.authorization;
  if (token?.startsWith('Bearer ') && !token.includes('invalid')) {
    (req as any).user = { id: 'test_123', username: 'test_user' };
    return next();
  }
  return res.status(401).json({ success: false, message: 'Não autorizado' });
};

export const createTestApp = (): Application => {
  const app = express();
  app.use(express.json());
  app.use('/api', testAuthMiddleware);
  app.use('/api/bot', botRoutes);
  
  app.use((err: Error, req: Request, res: Response) => {
    res.status(500).json({ success: false, message: err.message });
  });
  
  return app;
};