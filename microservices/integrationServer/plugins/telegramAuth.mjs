import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

/**
 * Временное хранилище для процессов авторизации
 * Map<sessionId, {client, apiId, apiHash, phoneNumber, timestamp}>
 */
const authSessions = new Map();

// Очистка старых сессий (старше 5 минут)
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of authSessions.entries()) {
    if (now - data.timestamp > 5 * 60 * 1000) {
      try {
        data.client?.disconnect();
      } catch (e) {
        // ignore
      }
      authSessions.delete(sessionId);
    }
  }
}, 60 * 1000);

/**
 * Шаг 1: Начать авторизацию - отправить код в Telegram
 */
export async function startTelegramAuth({ apiId, apiHash, phoneNumber }) {
  const apiIdNum = parseInt(apiId, 10);
  if (!Number.isFinite(apiIdNum)) {
    throw new Error('API ID должен быть числом');
  }

  if (!apiHash || !phoneNumber) {
    throw new Error('API Hash и номер телефона обязательны');
  }

  const sessionId = `tg_auth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const client = new TelegramClient(new StringSession(''), apiIdNum, apiHash, {
    connectionRetries: 3
  });

  try {
    await client.connect();

    // Отправляем код
    await client.sendCode(
      {
        apiId: apiIdNum,
        apiHash
      },
      phoneNumber
    );

    // Сохраняем во временное хранилище
    authSessions.set(sessionId, {
      client,
      apiId: apiIdNum,
      apiHash,
      phoneNumber,
      timestamp: Date.now()
    });

    console.log(`📱 Telegram auth started: sessionId=${sessionId}, phone=${phoneNumber}`);

    return {
      success: true,
      sessionId,
      message: 'Код отправлен в Telegram'
    };
  } catch (e) {
    try {
      await client.disconnect();
    } catch (disconnectErr) {
      // ignore
    }
    throw e;
  }
}

/**
 * Шаг 2: Подтвердить код и получить Session String
 */
export async function completeTelegramAuth({ sessionId, code, password }) {
  const authData = authSessions.get(sessionId);

  if (!authData) {
    throw new Error('Сессия авторизации не найдена или истекла. Начните заново.');
  }

  const { client, apiId, apiHash, phoneNumber } = authData;

  try {
    // Завершаем авторизацию с кодом
    await client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => code,
      password: password ? async () => password : undefined,
      onError: (err) => {
        throw new Error(err?.message || 'Ошибка авторизации');
      }
    });

    // Получаем Session String
    const sessionString = client.session.save();

    // Получаем информацию о пользователе
    const me = await client.getMe();

    console.log(`✅ Telegram auth completed: sessionId=${sessionId}, user=${me.username || me.firstName}`);

    // Отключаемся и удаляем временную сессию
    await client.disconnect();
    authSessions.delete(sessionId);

    return {
      success: true,
      sessionString,
      user: {
        id: me.id?.toString(),
        username: me.username,
        firstName: me.firstName,
        lastName: me.lastName,
        phone: me.phone
      }
    };
  } catch (e) {
    // Не удаляем сессию - можно попробовать ещё раз ввести код
    console.error(`❌ Telegram auth error: sessionId=${sessionId}`, e.message);
    throw e;
  }
}

/**
 * Отменить авторизацию
 */
export async function cancelTelegramAuth({ sessionId }) {
  const authData = authSessions.get(sessionId);

  if (authData) {
    try {
      await authData.client.disconnect();
    } catch (e) {
      // ignore
    }
    authSessions.delete(sessionId);
  }

  return { success: true };
}
