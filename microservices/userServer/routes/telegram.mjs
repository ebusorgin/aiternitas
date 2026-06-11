import express from 'express';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import telegram from '../plugins/telegramMTProto.mjs';
import { savePluginConfig, getPluginConfig, deletePluginConfig } from '../models/pluginConfig.mjs';

const router = express.Router();

// Временное хранилище для процессов авторизации (sessionId -> {mtproto, phoneNumber, config})
const authSessions = new Map();

// Очистка старых сессий
setInterval(() => {
  const now = Date.now();
  for (const [sid, data] of authSessions.entries()) {
    if (now - data.timestamp > 5 * 60 * 1000) {
      authSessions.delete(sid);
    }
  }
}, 60 * 1000);

function withTimeout(promise, ms, context) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        const err = new Error(`Операция "${context}" заняла больше ${ms / 1000} секунд. Попробуйте ещё раз позже.`);
        err.code = 'ETIMEDOUT';
        reject(err);
      }, ms);
    })
  ]);
}

/**
 * POST /api/telegram/connect
 * Подключение и тестирование Telegram (отправка кода и подтверждение)
 * Body: { apiId, apiHash, appTitle, publicKeys, phoneNumber?, code?, phoneCodeHash? }
 */
async function handleTelegramConnect(req, res) {
  try {
    const { apiId, apiHash, appTitle, publicKeys, phoneNumber, code, phoneCodeHash } = req.body || {};
    const userId = req.session.userId;

    // Валидация
    if (!apiId || !apiHash) {
      return res.status(400).json({
        success: false,
        error: 'App api_id и App api_hash обязательны'
      });
    }

    if (isNaN(parseInt(apiId, 10))) {
      return res.status(400).json({
        success: false,
        error: 'App api_id должен быть числом'
      });
    }

    const config = { apiId, apiHash, appTitle, publicKeys };

    console.log(`📱 Telegram test: userId=${userId}, apiId=${apiId}`);

    // Если есть code - значит это второй шаг (подтверждение)
    if (code && phoneCodeHash && phoneNumber) {
      const projectId = req.body.projectId || 'default';
      const elementId = req.body.elementId || 'telegram-plugin';
console.log(config, userId, phoneNumber, code, phoneCodeHash); 
      const result = await withTimeout(
        testTelegramConnection({
          config,
          userId,
          phoneNumber,
          code,
          phoneCodeHash
        }),
        60000,
        'подтверждения кода Telegram'
      );

      console.log(`📡 Telegram test result:`, result.status);

      // Если авторизация прошла успешно, сохраняем конфиг в БД
      if (result.success && result.status === 'connected') {
        try {
          await savePluginConfig({
            userId,
            projectId,
            elementId,
            pluginId: 'telegram',
            enabled: true,
            config: config
          });
          console.log(`💾 Telegram config saved to DB after auth for user ${userId}, element ${elementId}`);
        } catch (saveError) {
          console.error('❌ Failed to save telegram config to DB after auth:', saveError);
        }
      }

      return res.json(result);
    }
console.log("phoneNumber", phoneNumber, "code", code);
    // Если есть phoneNumber но нет кода - отправляем код
    if (phoneNumber && !code) {
      // Принудительно очищаем старую сессию перед новой авторизацией
      deleteTelegramSession(userId);
      const mtproto = createMTProtoClient(config, userId);

      try {
        // Отправка кода может занимать больше минуты, поэтому не ограничиваем таймаутом
        const codeResult = await sendAuthCode(mtproto, phoneNumber, config);

        console.log(`📨 Auth code sent to ${phoneNumber}`);

        return res.json({
          success: true,
          status: 'code_sent',
          phoneCodeHash: codeResult.phone_code_hash,
          message: `Код отправлен в Telegram на номер ${phoneNumber}`
        });
      } catch (error) {
        console.error(`❌ Send code error:`, error);
        return res.status(500).json({
          success: false,
          error: error.error_message || error.message || 'Ошибка отправки кода'
        });
      }
    }

    // Если ничего не передано - просто проверяем существующую авторизацию
    const projectId = req.body.projectId || 'default';
    const elementId = req.body.elementId || 'telegram-plugin';

    const result = await withTimeout(
      testTelegramConnection({ config, userId }),
      60000,
      'проверки подключения Telegram'
    );
    console.log(`📡 Telegram test result:`, result.status);

    // Если тест успешен и мы подключены, сохраняем конфиг в БД
    if (result.success && result.status === 'connected') {
      try {
        await savePluginConfig({
          userId,
          projectId,
          elementId,
          pluginId: 'telegram',
          enabled: true,
          config: config
        });
        console.log(`💾 Telegram config saved to DB for user ${userId}, element ${elementId}`);
      } catch (saveError) {
        console.error('❌ Failed to save telegram config to DB:', saveError);
      }
    }

    res.json(result);

  } catch (e) {
    console.error('❌ Telegram test error:', e);
    res.status(500).json({
      success: false,
      error: e.message || 'Ошибка тестирования'
    });
  }
}

// Новый основной endpoint
router.post('/connect', requireAuth, handleTelegramConnect);

// Алиас для обратной совместимости
router.post('/test', requireAuth, handleTelegramConnect);

/**
 * GET /api/telegram/stats
 * Получить статистику чатов Telegram (всего и непрочитанных)
 */
router.get('/stats', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const elementId = req.query.elementId || 'telegram-plugin';
    
    console.log(`📊 Requesting stats for user=${userId}, elementId=${elementId}`);
    
    // Загружаем конфиг из БД
    let savedConfig = await getPluginConfig({ userId, projectId: 'default', elementId });
    
    // Если по elementId не нашли, попробуем дефолтный (или наоборот)
    if (!savedConfig || !savedConfig.config) {
      console.log(`⚠️ Config for element ${elementId} not found, trying fallback 'telegram-plugin'`);
      savedConfig = await getPluginConfig({ userId, projectId: 'default', elementId: 'telegram-plugin' });
    }

    if (!savedConfig || !savedConfig.config) {
      console.log(`❌ No Telegram config found for user ${userId} (searched ${elementId} and fallback)`);
      
      // Попробуем найти ЛЮБОЙ конфиг телеграма для этого пользователя
      try {
        const anyConfig = await pool.query(
          'SELECT element_id FROM plugin_configs WHERE user_id = $1 AND plugin_id = $2 LIMIT 1',
          [userId, 'telegram']
        );
        if (anyConfig.rows.length > 0) {
          console.log(`💡 Found alternative element_id for user ${userId}: ${anyConfig.rows[0].element_id}`);
          savedConfig = await getPluginConfig({ userId, projectId: 'default', elementId: anyConfig.rows[0].element_id });
        }
      } catch (dbErr) {
        console.error('Error searching alternative config:', dbErr);
      }
    }

    if (!savedConfig || !savedConfig.config) {
      return res.status(404).json({
        success: false,
        error: 'Конфигурация Telegram не найдена',
        searchedId: elementId
      });
    }

    const mtproto = createMTProtoClient(savedConfig.config, userId);
    const stats = await getChatStats(mtproto);

    console.log(`📊 Telegram stats for user ${userId}:`, stats);

    res.json({
      success: true,
      stats
    });
  } catch (e) {
    if (e.error_message === 'AUTH_KEY_UNREGISTERED') {
      return res.status(401).json({
        success: false,
        error: 'Требуется авторизация в Telegram'
      });
    }
    console.error('❌ Telegram stats error:', e);
    res.status(500).json({
      success: false,
      error: e.message || 'Ошибка получения статистики'
    });
  }
});

/**
 * POST /api/telegram/disconnect
 * Отключить Telegram: удалить сессию и очистить конфигурацию
 */
router.post('/disconnect', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const elementId = req.body.elementId || 'telegram-plugin';
    const projectId = req.body.projectId || 'default';

    console.log(`🔌 Disconnecting Telegram for user ${userId}, element ${elementId}`);

    // 1. Удаляем сессию MTProto (файл)
    deleteTelegramSession(userId);

    // 2. Удаляем конфигурацию из БД
    await deletePluginConfig({ userId, projectId, elementId });

    res.json({
      success: true,
      message: 'Telegram успешно отключен'
    });
  } catch (e) {
    console.error('❌ Telegram disconnect error:', e);
    res.status(500).json({
      success: false,
      error: e.message || 'Ошибка при отключении Telegram'
    });
  }
});

export default router;
