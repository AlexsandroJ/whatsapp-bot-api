// src/__tests__/testEnvLoader.ts
import dotenv from 'dotenv';
import path from 'path';

// Carrega .env.test especificamente para testes
dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

// Garante NODE_ENV=test
process.env.NODE_ENV = 'test';