import express from 'express';
import { listPluginManifests, getPluginManifest } from '../plugins/index.mjs';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.mjs';
import { testTelegramConnection } from '../plugins/telegram.mjs';
import { savePluginConfig, getPluginConfig, deletePluginConfig } from '../models/pluginConfig.mjs';
import telegramConnectionManager from '../plugins/telegramConnectionManager.mjs';
import { startTelegramAuth, completeTelegramAuth, cancelTelegramAuth } from '../plugins/telegramAuth.mjs';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ plugins: listPluginManifests() });
});

router.get('/:pluginId', (req, res) => {
  const p = getPluginManifest(req.params.pluginId);
  if (!p) return res.status(404).json({ error: 'Плагин не найден' });
  res.json({ plugin: p });
});


// Save plugin configuration
router.post('/config/save', requireAuth, async (req, res) => {
  try {
    const { projectId, elementId, pluginId, enabled, config } = req.body || {};
    const userId = req.session.userId;

    if (!projectId || !elementId || !pluginId) {
      return res.status(400).json({ success: false, error: 'projectId, elementId и pluginId обязательны' });
    }

    // Extract sessionString from config (for telegram account mode)
    const sessionString = config?.sessionString || null;
    const configWithoutSession = { ...config };
    delete configWithoutSession.sessionString;

    const saved = await savePluginConfig({
      userId,
      projectId,
      elementId,
      pluginId,
      enabled: enabled !== false,
      config: configWithoutSession,
      sessionString
    });

    console.log(`✅ Plugin config saved: userId=${userId}, projectId=${projectId}, elementId=${elementId}, pluginId=${pluginId}, enabled=${enabled}`);

    res.json({ success: true, config: saved });
  } catch (e) {
    console.error('❌ Plugin config save error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка сохранения конфигурации' });
  }
});

// Get plugin configuration
router.get('/config/:projectId/:elementId', requireAuth, async (req, res) => {
  try {
    const { projectId, elementId } = req.params;
    const userId = req.session.userId;

    const config = await getPluginConfig({ userId, projectId, elementId });

    if (!config) {
      return res.json({ success: true, config: null });
    }

    res.json({ success: true, config });
  } catch (e) {
    console.error('❌ Plugin config get error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка получения конфигурации' });
  }
});

// Delete plugin configuration
router.delete('/config/:projectId/:elementId', requireAuth, async (req, res) => {
  try {
    const { projectId, elementId } = req.params;
    const userId = req.session.userId;

    // Отключаем Telegram если был подключен
    await telegramConnectionManager.disconnect(userId, projectId, elementId);

    await deletePluginConfig({ userId, projectId, elementId });

    console.log(`🗑️  Plugin config deleted: userId=${userId}, projectId=${projectId}, elementId=${elementId}`);

    res.json({ success: true });
  } catch (e) {
    console.error('❌ Plugin config delete error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка удаления конфигурации' });
  }
});

// Send message via Telegram (через активное подключение)
router.post('/telegram/send', requireAuth, async (req, res) => {
  try {
    const { projectId, elementId, chatId, message } = req.body || {};
    const userId = req.session.userId;

    if (!projectId || !elementId || !chatId || !message) {
      return res.status(400).json({ success: false, error: 'projectId, elementId, chatId и message обязательны' });
    }

    const result = await telegramConnectionManager.sendMessage(userId, projectId, elementId, { chatId, message });

    console.log(`📤 Telegram message sent: ${userId}:${projectId}:${elementId} -> ${chatId}`);

    res.json({ success: true, result });
  } catch (e) {
    console.error('❌ Telegram send error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка отправки сообщения' });
  }
});

// Get active Telegram connections status
router.get('/telegram/status', requireAuth, async (req, res) => {
  try {
    const status = telegramConnectionManager.getStatus();
    res.json({ success: true, connections: status });
  } catch (e) {
    console.error('❌ Telegram status error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка получения статуса' });
  }
});



// Disconnect Telegram
router.post('/telegram/disconnect', requireAuth, async (req, res) => {
  try {
    const { projectId, elementId } = req.body || {};
    const userId = req.session.userId;

    if (!projectId || !elementId) {
      return res.status(400).json({ success: false, error: 'projectId и elementId обязательны' });
    }

    await telegramConnectionManager.disconnect(userId, projectId, elementId);

    res.json({ success: true });
  } catch (e) {
    console.error('❌ Telegram disconnect error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка отключения' });
  }
});

// Send message via Telegram (через активное подключение)
router.post('/telegram/send', requireAuth, async (req, res) => {
  try {
    const { projectId, elementId, chatId, message } = req.body || {};
    const userId = req.session.userId;

    if (!projectId || !elementId || !chatId || !message) {
      return res.status(400).json({ success: false, error: 'projectId, elementId, chatId и message обязательны' });
    }

    const result = await telegramConnectionManager.sendMessage(userId, projectId, elementId, { chatId, message });

    console.log(`📤 Telegram message sent: ${userId}:${projectId}:${elementId} -> ${chatId}`);

    res.json({ success: true, result });
  } catch (e) {
    console.error('❌ Telegram send error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка отправки сообщения' });
  }
});

// Get active Telegram connections status
router.get('/telegram/status', requireAuth, async (req, res) => {
  try {
    const status = telegramConnectionManager.getStatus();
    res.json({ success: true, connections: status });
  } catch (e) {
    console.error('❌ Telegram status error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка получения статуса' });
  }
});

// Manually connect/reconnect Telegram
router.post('/telegram/connect', requireAuth, async (req, res) => {
  console.log('🔌 Telegram connect request received:', { body: req.body, userId: req.session.userId });
  return res.status(200).json({ success: true, message: 'Telegram connect request received' });
  try {
    const { projectId, elementId } = req.body || {};
    const userId = req.session.userId;

    if (!projectId || !elementId) {
      return res.status(400).json({ success: false, error: 'projectId и elementId обязательны' });
    }

    const config = await getPluginConfig({ userId, projectId, elementId });

    if (!config || !config.enabled) {
      return res.status(400).json({ success: false, error: 'Плагин не найден или отключен' });
    }

    const result = await telegramConnectionManager.connect({
      userId,
      projectId,
      elementId,
      pluginId: config.plugin_id,
      config: config.config,
      sessionString: config.sessionString
    });

    res.json({ success: true, result });
  } catch (e) {
    console.error('❌ Telegram connect error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка подключения' });
  }
});

// Disconnect Telegram
router.post('/telegram/disconnect', requireAuth, async (req, res) => {
  try {
    const { projectId, elementId } = req.body || {};
    const userId = req.session.userId;

    if (!projectId || !elementId) {
      return res.status(400).json({ success: false, error: 'projectId и elementId обязательны' });
    }

    await telegramConnectionManager.disconnect(userId, projectId, elementId);

    res.json({ success: true });
  } catch (e) {
    console.error('❌ Telegram disconnect error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка отключения' });
  }
});

// Telegram Authorization Flow: Step 1 - Start auth and send code
router.post('/telegram/auth/start', requireAuth, async (req, res) => {
  try {
    const { apiId, apiHash, phoneNumber } = req.body || {};

    if (!apiId || !apiHash || !phoneNumber) {
      return res.status(400).json({ success: false, error: 'apiId, apiHash и phoneNumber обязательны' });
    }

    const result = await startTelegramAuth({ apiId, apiHash, phoneNumber });

    res.json(result);
  } catch (e) {
    console.error('❌ Telegram auth start error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка начала авторизации' });
  }
});

// Telegram Authorization Flow: Step 2 - Complete auth with code (and password if needed)
router.post('/telegram/auth/complete', requireAuth, async (req, res) => {
  try {
    const { sessionId, code, password } = req.body || {};

    if (!sessionId || !code) {
      return res.status(400).json({ success: false, error: 'sessionId и code обязательны' });
    }

    const result = await completeTelegramAuth({ sessionId, code, password });

    res.json(result);
  } catch (e) {
    console.error('❌ Telegram auth complete error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка подтверждения кода' });
  }
});

// Telegram Authorization Flow: Cancel
router.post('/telegram/auth/cancel', requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId обязателен' });
    }

    const result = await cancelTelegramAuth({ sessionId });

    res.json(result);
  } catch (e) {
    console.error('❌ Telegram auth cancel error:', e);
    res.status(500).json({ success: false, error: e?.message || 'Ошибка отмены авторизации' });
  }
});

export default router;
