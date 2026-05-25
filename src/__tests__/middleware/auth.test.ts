// src/__tests__/middleware/auth.test.ts
/// <reference types="jest" />

import { Request, Response, NextFunction } from 'express';
import { protectRoute, apiKeyAuth } from '../../middleware/auth';
import * as authUtils from '../../utils/auth';

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
        message: 'Não autorizado, nenhum token'
      });
      expect(nextFunction).not.toHaveBeenCalled();
    });

    it('Deve retornar 401 se token for inválido', () => {
      jest.spyOn(authUtils, 'verifyToken').mockReturnValue(null);
      
      mockRequest.headers = { authorization: 'Bearer invalid_token' };

      protectRoute(mockRequest, mockResponse as Response, nextFunction);
      
      expect(authUtils.verifyToken).toHaveBeenCalledWith('invalid_token');
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ 
          success: false,
          message: expect.stringContaining('inválido') 
        })
      );
    });

    it('Deve chamar next() se token for válido', () => {
      const mockUser = { id: 'user123', username: 'testuser' };
      jest.spyOn(authUtils, 'verifyToken').mockReturnValue(mockUser);
      
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