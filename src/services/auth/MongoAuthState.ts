// src/services/auth/MongoAuthState.ts
import { AuthenticationState, BufferJSON, initAuthCreds, WAProto } from '@whiskeysockets/baileys';
import { BotSession } from '../../models/BotSession';
import { encryptData, decryptData, serializeKeys, deserializeKeys } from '../../utils/crypto';

export const useMongoAuthState = async (
  sessionId: string,
  userId: string,
  encryptionSecret: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {

  // Buscar ou criar sessão no banco
  let session = await BotSession.findOne({ sessionId, userId });

  if (!session) {
    session = await BotSession.create({
      userId,
      sessionId,
      name: `Bot ${sessionId.slice(0, 8)}`,
      status: 'disconnected',
      settings: {}
    });
  }

  // Carregar creds (descriptografar se existir)
// src/services/auth/MongoAuthState.ts, linha ~27:
let creds = initAuthCreds();
if (session.creds) {
  try {
    const decrypted = decryptData(session.creds, encryptionSecret);
    const parsed = JSON.parse(decrypted.toString(), BufferJSON.reviver);
    creds = { ...creds, ...parsed };
  } catch (error) {
    console.error('❌ Falha ao descriptografar creds, usando novos:', error);
    // creds já está inicializado com initAuthCreds()
  }
}
// Se session.creds for null/undefined, usa creds novos (initAuthCreds)

  let keysJson: string;
  if (typeof session.keys === 'string') {
    keysJson = session.keys;
  } else if (session.keys instanceof Map) {
    keysJson = serializeKeys(session.keys);
  } else if (session.keys && typeof session.keys === 'object') {
    keysJson = JSON.stringify(session.keys);
  } else {
    keysJson = '{}';
  }

  const keys = deserializeKeys(keysJson);

  // Função para salvar creds no banco
  const saveCreds = async () => {
    try {
      // Serializar e criptografar creds
      const credsJson = JSON.stringify(creds, BufferJSON.replacer);
      const encryptedCreds = encryptData(credsJson, encryptionSecret);

      // Serializar keys
      const serializedKeys = serializeKeys(keys);

      // Atualizar no banco (upsert)
      await BotSession.findOneAndUpdate(
        { sessionId, userId },
        {
          creds: encryptedCreds,
          keys: serializedKeys,
          $setOnInsert: { name: `Bot ${sessionId.slice(0, 8)}` }
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error('❌ Falha ao salvar creds no MongoDB:', error);
      throw error;
    }
  };

  return {
    state: {
      creds,
      keys: {
        get: (type, id) => keys.get(`${type}:${id}`),
        set: (data) => {
          if (data && typeof data === 'object') {
            Object.entries(data).forEach(([key, value]) => {
              keys.set(key, value);
            });
          }
        }
      }
    },
    saveCreds
  };
};

export default useMongoAuthState;