// src/__tests__/middleware/auth.test.ts
/// <reference types="jest" />

import { Request, Response, NextFunction } from 'express';
import { protectRoute, apiKeyAuth } from '../../middleware/auth';
import * as authUtils from '../../utils/auth';

// ✅ MOCK DO MÓDULO INTEIRO - Deve vir ANTES de qualquer uso do módulo
jest.mock('../../utils/auth', () => ({
  verifyToken: jest.fn(),
  // Se houver outras exports, mantenha-as:
  // hashPassword: jest.fn(),
  // comparePassword: jest.fn(),
}));

describe('Authentication Middleware', () => {
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  let nextFunction: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      body: {},
      query: {},
      params: {},
      cookies: {}
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    nextFunction = jest.fn();
  });

  describe('protectRoute (JWT)', () => {
    it('Deve retornar 401 se nenhum token for fornecido', () => {
      mockRequest.headers = {};

      protectRoute(mockRequest, mockResponse as Response, nextFunction);

      // ✅ Validação EXATA do retorno conhecido
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token não fornecido'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('Deve retornar 401 se token for inválido', () => {
      // ✅ CORREÇÃO: mockImplementation para LANÇAR erro (como o real faz)
      (authUtils.verifyToken as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      mockRequest.headers = { authorization: 'Bearer invalid_token' };

      protectRoute(mockRequest, mockResponse as Response, nextFunction);

      // ✅ Verificar que verifyToken foi chamado
      expect(authUtils.verifyToken).toHaveBeenCalledWith('invalid_token');

      // ✅ Agora o catch é executado e status(401) é chamado
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('inválido')
        })
      );
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('Deve chamar next() se token for válido', () => {
      const mockUser = { id: 'user123', username: 'testuser' };

      // ✅ Para token válido: retorna o usuário (sem lançar erro)
      (authUtils.verifyToken as jest.Mock).mockReturnValue(mockUser);

      mockRequest.headers = { authorization: 'Bearer valid_token' };

      protectRoute(mockRequest, mockResponse as Response, nextFunction);

      expect(authUtils.verifyToken).toHaveBeenCalledWith('valid_token');
      expect(nextFunction).toHaveBeenCalled();
      expect(mockRequest.user).toEqual(mockUser);
    });

    it('Deve extrair token do header Authorization corretamente', () => {
      jest.spyOn(authUtils, 'verifyToken').mockReturnValue({ id: '123' });

      mockRequest.headers = { authorization: 'Bearer my_jwt_token_here' };

      protectRoute(mockRequest, mockResponse as Response, nextFunction);

      expect(authUtils.verifyToken).toHaveBeenCalledWith('my_jwt_token_here');
    });
  });

  describe('apiKeyAuth', () => {
    beforeEach(() => {
      process.env.API_KEY = 'test_api_key_123';
    });

    it('Deve retornar 403 se API Key não for fornecida', () => {
      mockRequest.headers = {};

      apiKeyAuth(mockRequest, mockResponse as Response, nextFunction);

      // ✅ Validação EXATA do retorno conhecido
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Chave de API inválida ou ausente'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('Deve retornar 403 se API Key for inválida', () => {
      mockRequest.headers = { 'x-api-key': 'wrong_key' };
      apiKeyAuth(mockRequest, mockResponse as Response, nextFunction);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('Deve chamar next() se API Key for válida', () => {
      mockRequest.headers = { 'x-api-key': 'test_api_key_123' };
      apiKeyAuth(mockRequest, mockResponse as Response, nextFunction);
      expect(nextFunction).toHaveBeenCalled();
    });

    it('Deve ser case-sensitive para API Key', () => {
      mockRequest.headers = { 'x-api-key': 'TEST_API_KEY_123' };
      apiKeyAuth(mockRequest, mockResponse as Response, nextFunction);
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });
});