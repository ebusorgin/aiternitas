import express from 'express';
import { requireAuth } from '../middleware/auth.mjs';
import {
  createMTProtoClient,
  sendAuthCode,
  testTelegramConnection
} from '../plugins/telegramMTProto.mjs';

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

/**
 * POST /api/telegram/test
 * Тестировать подключение Telegram
 * Body: { apiId, apiHash, appTitle, publicKeys, phoneNumber?, code?, phoneCodeHash? }
 */
router.post('/test', requireAuth, async (req, res) => {
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

    const config = { apiId, apiHash, appTitle, publicKeys };

    console.log(`📱 Telegram test: userId=${userId}, apiId=${apiId}`);

    // Если есть code - значит это второй шаг (подтверждение)
    if (code && phoneCodeHash && phoneNumber) {
      const result = await testTelegramConnection({
        config,
        userId,
        phoneNumber,
        code,
        phoneCodeHash
      });

      console.log(`📡 Telegram test result:`, result.status);
      return res.json(result);
    }

    // Если есть phoneNumber но нет кода - отправляем код
    if (phoneNumber) {
      const mtproto = createMTProtoClient(config, userId);

      try {
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
    const result = await testTelegramConnection({ config, userId });
    console.log(`📡 Telegram test result:`, result.status);
    res.json(result);

  } catch (e) {
    console.error('❌ Telegram test error:', e);
    res.status(500).json({
      success: false,
      error: e.message || 'Ошибка тестирования'
    });
  }
});

export default router;
