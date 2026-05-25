#!/bin/bash

# =============================================================================
# 🤖 WhatsApp Bot API - Gerador de README.md
# Script para gerar documentação automática do projeto
# =============================================================================

set -e  # Sai imediatamente se algum comando falhar

# Cores para output (opcional)
GREEN='\033[0;32m'
BLUE='\033[1;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Gerando README.md para WhatsApp Bot API...${NC}"

# Nome do arquivo de saída
OUTPUT_FILE="README.md"

# Cabeçalho
cat > "$OUTPUT_FILE" << 'EOF'
# 🤖 WhatsApp Bot API

[![Node.js](https://img.shields.io/badge/Node.js-18.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Jest](https://img.shields.io/badge/Testes-Jest-C21325.svg)](https://jestjs.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.x-47A248.svg)](https://www.mongodb.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> API RESTful robusta para automação do WhatsApp com Baileys, construída com TypeScript, Express e MongoDB. Inclui autenticação JWT, testes abrangentes e suporte a múltiplos tipos de mídia.

---

## 📋 Índice

- [✨ Funcionalidades](#-funcionalidades)
- [🛠️ Tecnologias](#️-tecnologias)
- [🚀 Instalação Rápida](#-instalação-rápida)
- [⚙️ Configuração](#️-configuração)
- [📡 Documentação da API](#-documentação-da-api)
- [🧪 Testes](#-testes)
- [📁 Estrutura do Projeto](#-estrutura-do-projeto)
- [🔒 Segurança](#-segurança)
- [🤝 Contribuindo](#-contribuindo)
- [📄 Licença](#-licença)

---

## ✨ Funcionalidades

### 🔐 Autenticação & Usuários
- [x] Registro e login de usuários com JWT
- [x] Middleware de proteção de rotas
- [x] Refresh token (opcional)
- [x] Validação de entrada com sanitização

### 💬 Envio de Mensagens
- [x] **Texto**: Mensagens simples e com citação (quoted)
- [x] **Mídia**: Imagens, vídeos, documentos e áudios (com suporte a PTT/nota de voz)
- [x] **Especiais**: Contatos (vCard), localização (GPS), listas interativas e botões
- [x] **Formatação automática**: Normalização de números para JID WhatsApp

### 🔧 Gerenciamento de Mensagens
- [x] Marcar mensagens como lidas
- [x] Reagir a mensagens com emojis
- [x] Encaminhar mensagens recebidas
- [x] Deletar mensagens (para todos ou apenas para você)

### 🔗 Conexão com WhatsApp
- [x] Geração e exibição de QR Code no terminal
- [x] Reconexão automática em caso de falha
- [x] Persistência de sessão com `auth_info_baileys`
- [x] Multi-device support via Baileys

### 🧪 Qualidade de Código
- [x] **100% tipado** com TypeScript
- [x] **Testes abrangentes** com Jest (>90% de cobertura no core)
- [x] MongoDB em memória para testes isolados e rápidos
- [x] Mocks configuráveis para serviços externos

### 📊 Monitoramento & Logs
- [x] Health check endpoint (`GET /api/bot/health`)
- [x] Logging estruturado de requisições e erros
- [x] Auditoria de mensagens enviadas/recebidas (MessageLog)
- [x] Debug de variáveis de ambiente em desenvolvimento

---

## 🛠️ Tecnologias

| Categoria | Tecnologias |
|-----------|-------------|
| **Runtime** | Node.js 18+, TypeScript 5 |
| **Framework** | Express.js, TypeScript |
| **WhatsApp** | @whiskeysockets/baileys, qrcode-terminal |
| **Banco de Dados** | MongoDB, Mongoose, mongodb-memory-server |
| **Autenticação** | JSON Web Token (jsonwebtoken), bcryptjs |
| **Testes** | Jest, Supertest, ts-jest |
| **Utilitários** | dotenv, pino (logging), express-rate-limit |
| **DevOps** | Docker (opcional), GitHub Actions (CI/CD) |

---

## 🚀 Instalação Rápida

### Pré-requisitos
- Node.js >= 18.x
- npm >= 9.x ou yarn >= 1.22.x
- MongoDB (opcional para produção; testes usam versão em memória)

### Passo a passo

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/whatsapp-bot-api.git
cd whatsapp-bot-api

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas configurações (veja seção Configuração)

# 4. Execute as migrações (se houver)
# npm run migrate  # (opcional, se usar migrações)

# 5. Inicie o servidor em desenvolvimento
npm run dev

# 6. Acesse a API
# Servidor rodando em: http://localhost:3000
# Health check: http://localhost:3000/api/bot/health

npm test                             # Testes unitários + integração
npm run test:coverage                # Relatório de cobertura HTML/LCOV
npm run test:watch                   # Modo watch com reexecução automática
npx jest src/__tests__/WhatsAppService.test.ts # Testes separadamente