// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { AuthRequest, AuthPayload } from '../types/auth';

// Middleware para proteger rotas com JWT
export const protectRoute = (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): void => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    res.status(401).json({ success: false, message: 'Token não fornecido' });
    return;
  }
  
  try {
    const decoded = verifyToken(token);
    req.user = decoded; // ✅ TypeScript sabe que req.user existe aqui
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token inválido' });
  }
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