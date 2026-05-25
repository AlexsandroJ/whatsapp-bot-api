// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';

// Middleware para proteger rotas com JWT
export const protectRoute = (req: Request, res: Response, next: NextFunction) => {
  let token = '';
  
  // ✅ CORREÇÃO: Verificar se headers existe antes de acessar
  if (req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
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

// Middleware para proteção simples por API Key
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction) => {
  // ✅ CORREÇÃO: Verificar se headers existe
  const apiKey = req.headers?.['x-api-key'];
  const validApiKey = process.env.API_KEY;

  if (!apiKey || apiKey !== validApiKey) {
    return res.status(403).json({ success: false, message: 'Chave de API inválida ou ausente' });
  }
  next();
};