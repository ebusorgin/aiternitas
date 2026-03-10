import MTProto from '@mtproto/core';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Упрощённый manifest для Telegram
export const manifest = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Подключите Telegram аккаунт (двойной клик для настройки)',
  fields: [] // Поля показываются в модальном окне, а не в общем списке
};

/**
 * Создать MTProto клиент для тестирования
 * @param {Object} config - {apiId, apiHash, appTitle, publicKeys}
 * @param {number} userId - ID пользователя для хранения сессии
 */
export function createMTProtoClient(config, userId) {
  const storageDir = path.resolve(__dirname, `../../data/telegram-sessions`);

  // Создаём директорию для сессий
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const storagePath = path.join(storageDir, `session_${userId}.json`);

  const mtproto = new MTProto({
    api_id: parseInt(config.apiId, 10),
    api_hash: config.apiHash,
    storageOptions: {
      path: storagePath
    }
  });

  return mtproto;
}

/**
 * Отправить код авторизации с обработкой миграции DC
 */
export async function sendAuthCode(mtproto, phoneNumber, config) {
  console.log(`📞 Sending auth code to ${phoneNumber}...`);

  try {
    const result = await mtproto.call('auth.sendCode', {
      phone_number: phoneNumber,
      api_id: parseInt(config.apiId, 10),
      api_hash: config.apiHash,
      settings: {
        _: 'codeSettings'
      }
    });

    console.log(`✅ Auth code sent successfully`);
    return result;
  } catch (error) {
    console.log(`❌ Error caught in sendAuthCode:`, {
      error_code: error.error_code,
      error_message: error.error_message
    });

    // Обработка PHONE_MIGRATE_X и USER_MIGRATE_X
    if (error.error_code === 303 && error.error_message && error.error_message.includes('_MIGRATE_')) {
      const dcId = parseInt(error.error_message.split('_')[2], 10);
      console.log(`📱 Migration to DC ${dcId} required, switching...`);

      // Переключаемся на нужный DC
      await mtproto.setDefaultDc(dcId);
      console.log(`✅ Switched to DC ${dcId}, retrying...`);

      // Повторяем запрос с новым DC
      const retryResult = await mtproto.call('auth.sendCode', {
        phone_number: phoneNumber,
        api_id: parseInt(config.apiId, 10),
        api_hash: config.apiHash,
        settings: {
          _: 'codeSettings'
        }
      });

      console.log(`✅ Auth code sent after migration`);
      return retryResult;
    }

    // Обработка AUTH_RESTART - перезапускаем запрос один раз
    if (error.error_message === 'AUTH_RESTART') {
      console.log(`🔄 AUTH_RESTART received, retrying sendAuthCode...`);
      return mtproto.call('auth.sendCode', {
        phone_number: phoneNumber,
        api_id: parseInt(config.apiId, 10),
        api_hash: config.apiHash,
        settings: {
          _: 'codeSettings'
        }
      });
    }

    console.log(`❌ Throwing error: ${error.error_message}`);
    throw error;
  }
}

/**
 * Подписать (войти) с кодом
 */
export async function signIn(mtproto, phoneNumber, code, phoneCodeHash) {
  return mtproto.call('auth.signIn', {
    phone_number: phoneNumber,
    phone_code_hash: phoneCodeHash,
    phone_code: code
  });
}

/**
 * Проверить авторизацию
 */
export async function checkAuth(mtproto) {
  return mtproto.call('users.getFullUser', {
    id: {
      _: 'inputUserSelf'
    }
  });
}

/**
 * Отправить сообщение себе в "Избранное" (Saved Messages)
 */
export async function sendMessageToSelf(mtproto, messageText) {
  return mtproto.call('messages.sendMessage', {
    peer: {
      _: 'inputPeerSelf'
    },
    message: messageText,
    random_id: Math.floor(Math.random() * 1e16)
  });
}

/**
 * Получить статистику чатов (всего и непрочитанных)
 */
export async function getChatStats(mtproto) {
  try {
    const dialogs = await mtproto.call('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: {
        _: 'inputPeerEmpty'
      },
      limit: 100, // Лимит 100 для статистики достаточно
      hash: 0
    });

    let totalChats = 0;
    let totalUnread = 0;

    // messages.dialogsSlice содержит поле count для общего количества
    if (dialogs._ === 'messages.dialogsSlice') {
      totalChats = dialogs.count;
    } else if (dialogs._ === 'messages.dialogs') {
      totalChats = dialogs.dialogs.length;
    }

    if (dialogs.dialogs) {
      for (const dialog of dialogs.dialogs) {
        totalUnread += dialog.unread_count || 0;
      }
    }

    return { totalChats, totalUnread };
  } catch (error) {
    console.error('❌ Error in getChatStats:', error);
    throw error;
  }
}

/**
 * Удалить сессию Telegram для пользователя
 */
export function deleteTelegramSession(userId) {
  const storageDir = path.resolve(__dirname, `../../data/telegram-sessions`);
  const storagePath = path.join(storageDir, `session_${userId}.json`);
  
  if (fs.existsSync(storagePath)) {
    try {
      fs.unlinkSync(storagePath);
      console.log(`🗑️ Deleted Telegram session for user ${userId}`);
      return true;
    } catch (err) {
      console.error(`❌ Failed to delete Telegram session for user ${userId}:`, err);
      throw err;
    }
  }
  return false;
}

/**
 * Тест подключения:
 * 1. Создать клиент
 * 2. Проверить авторизацию
 * 3. Отправить сообщение в "Избранное"
 * 4. Вернуть результат
 */
export async function testTelegramConnection({ config, userId, phoneNumber, code, phoneCodeHash }) {
  const mtproto = createMTProtoClient(config, userId);

  try {
    // Если есть код - пытаемся авторизоваться
    if (code && phoneCodeHash) {
      await signIn(mtproto, phoneNumber, code, phoneCodeHash);
    }

    // Проверяем авторизацию
    const user = await checkAuth(mtproto);

    // Отправляем тестовое сообщение в "Избранное"
    const testMessage = `✅ Aiternitas Telegram Test\nUser: ${user.users[0].first_name}\nTime: ${new Date().toISOString()}`;
    await sendMessageToSelf(mtproto, testMessage);

    return {
      success: true,
      status: 'connected',
      user: {
        id: user.users[0].id,
        firstName: user.users[0].first_name,
        username: user.users[0].username,
        phone: user.users[0].phone
      },
      message: 'Тест пройден! Сообщение отправлено в "Избранное"'
    };
  } catch (error) {
    // Если AUTH_KEY_UNREGISTERED - нужна авторизация
    if (error.error_message === 'AUTH_KEY_UNREGISTERED') {
      return {
        success: false,
        status: 'auth_required',
        needsAuth: true,
        message: 'Требуется авторизация. Введите номер телефона.'
      };
    }

    // Если ошибка миграции DC
    if (error.error_message && error.error_message.includes('_MIGRATE_')) {
      const [, nextDcId] = error.error_message.split('_MIGRATE_');
      mtproto.setDefaultDc(+nextDcId);
      // Повторяем попытку
      return testTelegramConnection({ config, userId, phoneNumber, code, phoneCodeHash });
    }

    return {
      success: false,
      status: 'error',
      error: error.error_message || error.message || 'Ошибка подключения',
      message: error.error_message || error.message
    };
  }
}
