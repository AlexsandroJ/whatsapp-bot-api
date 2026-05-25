// src/__tests__/utils/auth.test.ts
/// <reference types="jest" />

import jwt from 'jsonwebtoken';
import { generateToken, verifyToken } from '../../utils/auth';

describe('Auth Utils - JWT', () => {
  const TEST_USER_ID = 'user_12345';
  const SECRET = process.env.JWT_SECRET || 'secret';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== generateToken() ====================

  describe('generateToken()', () => {
    it('Deve gerar token JWT válido para userId', () => {
      const token = generateToken(TEST_USER_ID);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('Deve gerar token com payload contendo o id do usuário', () => {
      const token = generateToken(TEST_USER_ID);
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      
      expect(decoded).toBeDefined();
      expect(decoded?.id).toBe(TEST_USER_ID);
    });

    it('Deve gerar token com expiração de 1 dia', () => {
      const token = generateToken(TEST_USER_ID);
      const decoded = jwt.decode(token) as jwt.JwtPayload;
      
      expect(decoded?.exp).toBeDefined();
      
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + 24 * 60 * 60;
      
      expect(decoded?.exp).toBeGreaterThanOrEqual(expectedExp - 5);
      expect(decoded?.exp).toBeLessThanOrEqual(expectedExp + 5);
    });

    // ✅ CORREÇÃO: Teste ajustado para validar independência, não unicidade
    it('Deve gerar tokens válidos e independentes para mesma userId', () => {
      const token1 = generateToken(TEST_USER_ID);
      const token2 = generateToken(TEST_USER_ID);
      
      // Ambos devem ser válidos e decodificáveis
      const verified1 = verifyToken(token1);
      const verified2 = verifyToken(token2);
      
      expect(verified1?.id).toBe(TEST_USER_ID);
      expect(verified2?.id).toBe(TEST_USER_ID);
      
      // Ambos devem ter expiração válida
      expect(verified1?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(verified2?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it('Deve usar JWT_SECRET do ambiente se definido', () => {
      const originalSecret = process.env.JWT_SECRET;
      process.env.JWT_SECRET = 'custom_secret_123';
      
      jest.resetModules();
      const { generateToken: generateTokenWithCustomSecret } = require('../../utils/auth');
      
      const token = generateTokenWithCustomSecret(TEST_USER_ID);
      
      const verified = jwt.verify(token, 'custom_secret_123');
      expect((verified as jwt.JwtPayload).id).toBe(TEST_USER_ID);
      
      expect(() => jwt.verify(token, 'secret')).toThrow();
      
      process.env.JWT_SECRET = originalSecret;
    });
  });

  // ==================== verifyToken() ====================

  describe('verifyToken()', () => {
    it('Deve retornar payload para token válido', () => {
      const token = generateToken(TEST_USER_ID);
      const result = verifyToken(token);
      
      expect(result).toBeDefined();
      expect(result.id).toBe(TEST_USER_ID);
      expect(result.iat).toBeDefined();
      expect(result.exp).toBeDefined();
    });

    it('Deve retornar null para token inválido (malformado)', () => {
      const result = verifyToken('token.invalido.nao.jwt');
      expect(result).toBeNull();
    });

    it('Deve retornar null para token com assinatura incorreta', () => {
      const wrongToken = jwt.sign({ id: TEST_USER_ID }, 'wrong_secret');
      const result = verifyToken(wrongToken);
      expect(result).toBeNull();
    });

    it('Deve retornar null para token expirado', () => {
      const expiredToken = jwt.sign(
        { id: TEST_USER_ID, exp: Math.floor(Date.now() / 1000) - 100 },
        SECRET
      );
      const result = verifyToken(expiredToken);
      expect(result).toBeNull();
    });

    it('Deve retornar null para string vazia', () => {
      const result = verifyToken('');
      expect(result).toBeNull();
    });

    it('Deve retornar null para undefined', () => {
      const result = verifyToken(undefined as any);
      expect(result).toBeNull();
    });

    it('Deve retornar null para null', () => {
      const result = verifyToken(null as any);
      expect(result).toBeNull();
    });
  });

  // ==================== Integração ====================

  describe('Integração generateToken + verifyToken', () => {
    it('Deve gerar e verificar token corretamente', () => {
      const token = generateToken(TEST_USER_ID);
      const verified = verifyToken(token);
      
      expect(verified).not.toBeNull();
      expect(verified?.id).toBe(TEST_USER_ID);
    });

    it('Deve preservar dados extras no payload', () => {
      const token = jwt.sign(
        { id: TEST_USER_ID, role: 'admin', email: 'user@example.com' },
        SECRET,
        { expiresIn: '1d' }
      );
      
      const verified = verifyToken(token);
      
      expect(verified?.id).toBe(TEST_USER_ID);
      expect(verified?.role).toBe('admin');
      expect(verified?.email).toBe('user@example.com');
    });
  });

  // ==================== Edge Cases ====================

  describe('Casos de Borda', () => {
    it('Deve lidar com userId contendo caracteres especiais', () => {
      const specialUserId = 'user@domain.com#123!';
      const token = generateToken(specialUserId);
      const verified = verifyToken(token);
      
      expect(verified?.id).toBe(specialUserId);
    });

    it('Deve lidar com userId muito longo', () => {
      const longUserId = 'a'.repeat(1000);
      const token = generateToken(longUserId);
      const verified = verifyToken(token);
      
      expect(verified?.id).toBe(longUserId);
    });

    it('Deve gerar token mesmo com SECRET vazio (fallback)', () => {
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      
      jest.resetModules();
      const { generateToken: generateWithEmptySecret } = require('../../utils/auth');
      
      const token = generateWithEmptySecret(TEST_USER_ID);
      expect(token).toBeDefined();
      
      process.env.JWT_SECRET = originalSecret;
    });
  });
});