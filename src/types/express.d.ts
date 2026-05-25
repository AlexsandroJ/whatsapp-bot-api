// src/types/express.d.ts
import { Types } from 'mongoose';
import { Request } from 'express';

// Estender a interface Request do Express
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string | Types.ObjectId;
        username: string;
        iat?: number;
        exp?: number;
      };
    }
  }
}

// Exportar tipo utilitário para uso em controllers
export interface AuthenticatedRequest extends Request {
  user: {
    id: string | Types.ObjectId;
    username: string;
    iat?: number;
    exp?: number;
  };
}