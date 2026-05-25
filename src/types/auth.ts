// src/types/auth.ts
import { Request } from 'express';
import { Types } from 'mongoose';

/**
 * Payload decodificado do token JWT
 */
export interface AuthPayload {
  /** ID do usuário (string ou ObjectId) */
  id: string | Types.ObjectId;
  /** Username do usuário */
  username: string;
  /** Timestamp de emissão do token (opcional) */
  iat?: number;
  /** Timestamp de expiração do token (opcional) */
  exp?: number;
}

/**
 * Request extendido com propriedade `user` injetada pelo middleware de auth
 * 
 * Uso em controllers:
 * ```typescript
 * export const myHandler = async (req: AuthRequest, res: Response) => {
 *   const userId = req.user.id; // ✅ Tipado corretamente
 *   // ...
 * }
 * ```
 */
export interface AuthRequest<
  TParams = any,
  TResBody = any,
  TReqBody = any,
  TQuery = any
> extends Request<TParams, TResBody, TReqBody, TQuery> {
  /** Usuário autenticado (injetado pelo middleware protectRoute) */
  user: AuthPayload;
}

/**
 * Tipo utilitário para responses padronizadas da API
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string | undefined>;
  error?: {
    name?: string;
    message?: string;
    stack?: string;
  };
}

/**
 * Tipo para paginação em listas
 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Tipo para erros de validação
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}