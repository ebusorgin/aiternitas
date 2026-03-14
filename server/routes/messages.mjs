/**
 * API раздела «Сообщения»: подключение сервисов (WhatsApp, Telegram), контакты, чат, медиа.
 * Принимает io (Socket.IO) для рассылки events messages:new при новых входящих сообщениях.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { requireJwtAndLoadUser } from '../middleware/jwtAuth.mjs';

const MESSAGES_MEDIA_DIR = path.join(process.cwd(), 'uploads', 'messages');

let whatsappService = null;
let telegramService = null;
try {
  const w = await import('../services/messaging/whatsapp.mjs');
  whatsappService = w;
} catch (e) {
  console.warn('WhatsApp integration not available:', e.message);
}
try {
  const t = await import('../services/messaging/telegram.mjs');
  telegramService = t;
} catch (e) {
  console.warn('Telegram integration not available:', e.message);
}

function createMessagesRouter(io) {
  const router = express.Router();

const SERVICE_TYPES = ['whatsapp', 'telegram'];

// GET /api/messages/services — список подключённых сервисов пользователя
router.get('/services', requireJwtAndLoadUser, requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const r = await pool.query(
      `SELECT id, service_type, status, external_id, created_at
       FROM messaging_services
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json({ success: true, services: r.rows });
  } catch (e) {
    console.error('GET /api/messages/services:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// MIME по расширению для раздачи медиа
const MIME_BY_EXT = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac'
};

// GET /api/messages/media/:filename — отдать файл медиа (только владельцу). filename = userId_uuid.ext
router.get('/media/:filename', requireJwtAndLoadUser, requireAuth, (req, res) => {
  const userId = req.userId;
  const filename = req.params.filename;
  const m = filename?.match(/^(\d+)_[a-f0-9-]+\.[a-z0-9]+$/i);
  if (!m) {
    return res.status(400).json({ error: 'Некорректный filename' });
  }
  const fileUserId = parseInt(m[1], 10);
  if (fileUserId !== userId) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }
  const filePath = path.join(MESSAGES_MEDIA_DIR, filename);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return res.status(404).json({ error: 'Файл не найден' });
  }
  const ext = path.extname(filename).slice(1).toLowerCase();
  const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.resolve(filePath));
});

// POST /api/messages/services/connect — начать подключение (заглушка: моковый QR для WhatsApp)
router.post('/services/connect', requireJwtAndLoadUser, requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const { service_type: serviceType } = req.body;
    if (!serviceType || !SERVICE_TYPES.includes(serviceType)) {
      return res.status(400).json({ error: 'Укажите service_type: whatsapp или telegram' });
    }

    const existing = await pool.query(
      'SELECT id, status FROM messaging_services WHERE user_id = $1 AND service_type = $2',
      [userId, serviceType]
    );
    if (existing.rows.length > 0 && existing.rows[0].status === 'connected') {
      return res.json({ success: true, already_connected: true, message: 'Сервис уже подключён' });
    }

    let serviceId;
    if (existing.rows.length > 0) {
      serviceId = existing.rows[0].id;
      await pool.query(
        `UPDATE messaging_services SET status = 'pending_qr', session_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [serviceId]
      );
    } else {
      const ins = await pool.query(
        `INSERT INTO messaging_services (user_id, service_type, status) VALUES ($1, $2, 'pending_qr') RETURNING id`,
        [userId, serviceType]
      );
      serviceId = ins.rows[0].id;
    }

    if (serviceType === 'whatsapp') {
      if (whatsappService) {
        whatsappService.startConnection(userId, {
          pool,
          onQr: (qrDataUrl) => {
            if (io) io.to(`user:${userId}`).emit('messages:qr', { qr: qrDataUrl });
          },
          onReady: async (uid) => {
            await pool.query(
              `UPDATE messaging_services SET status = 'connected', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND service_type = 'whatsapp'`,
              [uid]
            );
            await whatsappService.syncContactsToDb(pool, uid);
            if (io) io.to(`user:${uid}`).emit('messages:connected', { service_type: 'whatsapp' });
          },
          onAuthFailure: (msg) => {
            if (io) io.to(`user:${userId}`).emit('messages:qr_error', { message: msg || 'Ошибка авторизации' });
          },
          onIncomingMessage: (uid, contactId, message) => {
            if (io) io.to(`user:${uid}`).emit('messages:new', { contactId, message });
          }
        });
        return res.json({
          success: true,
          message: 'QR-код появится ниже. Отсканируйте его в приложении WhatsApp на телефоне.',
          use_socket_qr: true
        });
      }
      const placeholderQr = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
        '<rect fill="#fff" width="200" height="200"/>' +
        '<text x="100" y="100" text-anchor="middle" fill="#333" font-size="14">QR-код WhatsApp</text></svg>'
      );
      const testContacts = [
        { external_id: '79001234567', display_name: 'Тест WhatsApp 1' },
        { external_id: '79007654321', display_name: 'Тест WhatsApp 2' }
      ];
      for (const tc of testContacts) {
        await pool.query(
          `INSERT INTO messaging_contacts (user_id, service_type, external_id, display_name)
           VALUES ($1, 'whatsapp', $2, $3)
           ON CONFLICT (user_id, service_type, external_id) DO NOTHING`,
          [userId, tc.external_id, tc.display_name]
        );
      }
      return res.json({ success: true, qr: placeholderQr, message: 'Отсканируйте QR-код в приложении WhatsApp' });
    }

    if (serviceType === 'telegram') {
      const telegramApiId = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
      const telegramApiHash = (process.env.TELEGRAM_API_HASH || '').trim();
      if (telegramApiId <= 0 || !telegramApiHash) {
        return res.status(400).json({
          error: 'Для встроенного Telegram нужна одноразовая настройка: добавьте в .env на сервере TELEGRAM_API_ID и TELEGRAM_API_HASH (получить: https://my.telegram.org → API development tools). Либо используйте «Telegram в браузере» — откроется web.telegram.org, вход по QR без настроек.'
        });
      }
      const phone = req.body.phone && String(req.body.phone).trim();
      const callbacks = {
        pool,
        onReady: async (uid, sessionString) => {
          await pool.query(
            `UPDATE messaging_services SET status = 'connected', session_data = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND service_type = 'telegram'`,
            [sessionString, uid]
          );
            await telegramService.syncContactsToDb(pool, uid);
            if (io) io.to(`user:${uid}`).emit('messages:connected', { service_type: 'telegram' });
        },
        onAuthFailure: (msg) => {
          if (io) io.to(`user:${userId}`).emit('messages:qr_error', { message: msg || 'Ошибка авторизации' });
        },
        onIncomingMessage: (uid, contactId, message) => {
          if (io) io.to(`user:${uid}`).emit('messages:new', { contactId, message });
        }
      };
      if (telegramService) {
        if (phone) {
          await telegramService.startConnection(userId, {
            ...callbacks,
            phone,
            onCodeRequest: (uid) => {
              if (io) io.to(`user:${uid}`).emit('messages:telegram_code', {});
            }
          });
          return res.json({
            success: true,
            need_code: true,
            message: 'Введите код из приложения Telegram (SMS или приложение)'
          });
        }
        await telegramService.startConnectionWithQr(userId, {
          ...callbacks,
          onQr: (qrDataUrl) => {
            if (io) io.to(`user:${userId}`).emit('messages:qr', { qr: qrDataUrl });
          }
        });
        return res.json({
          success: true,
          message: 'QR-код появится ниже. Отсканируйте его в приложении Telegram на телефоне.',
          use_socket_qr: true
        });
      }
      return res.json({
        success: true,
        message: 'Telegram API не настроен (TELEGRAM_API_ID, TELEGRAM_API_HASH).'
      });
    }

    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/messages/services/connect:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/messages/services/telegram-code — передать код из Telegram после запроса connect с phone
router.post('/services/telegram-code', requireJwtAndLoadUser, requireAuth, (req, res) => {
  try {
    const userId = req.userId;
    const code = req.body.code;
    if (code == null || String(code).trim() === '') {
      return res.status(400).json({ success: false, error: 'Укажите код (code)' });
    }
    if (!telegramService?.submitCode) {
      return res.status(503).json({ success: false, error: 'Telegram не настроен' });
    }
    const ok = telegramService.submitCode(userId, String(code).trim());
    if (!ok) {
      return res.status(400).json({ success: false, error: 'Нет ожидающего запроса кода. Сначала отправьте номер телефона (POST connect с phone).' });
    }
    res.json({ success: true, message: 'Код принят. Ожидайте подключения.' });
  } catch (e) {
    console.error('POST /api/messages/services/telegram-code:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/messages/contacts — список контактов с превью последнего сообщения, сортировка по времени последнего сообщения в истории
router.get('/contacts', requireJwtAndLoadUser, requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const r = await pool.query(
      `SELECT c.id, c.service_type, c.external_id, c.display_name, c.avatar_url,
              cm.last_message_at,
              cm.last_message_preview
       FROM messaging_contacts c
       LEFT JOIN (
         SELECT contact_id,
                MAX(created_at) AS last_message_at,
                (array_agg(body ORDER BY created_at DESC))[1] AS last_message_preview
         FROM chat_messages
         GROUP BY contact_id
       ) cm ON cm.contact_id = c.id
       WHERE c.user_id = $1
       ORDER BY cm.last_message_at DESC NULLS LAST, c.updated_at DESC`,
      [userId]
    );
    const contacts = r.rows.map((row) => ({
      id: row.id,
      service_type: row.service_type,
      external_id: row.external_id,
      display_name: row.display_name || row.external_id,
      avatar_url: row.avatar_url || null,
      last_message_preview: row.last_message_preview ? (row.last_message_preview.length > 60 ? row.last_message_preview.slice(0, 60) + '…' : row.last_message_preview) : null,
      last_message_at: row.last_message_at
    }));
    res.json({ success: true, contacts });
  } catch (e) {
    console.error('GET /api/messages/contacts:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/messages/contacts/:contactId/messages — история сообщений с контактом. При клике на контакт (WhatsApp) — синхронизация истории из мессенджера на всякий случай.
router.get('/contacts/:contactId/messages', requireJwtAndLoadUser, requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const contactId = parseInt(req.params.contactId, 10);
    if (!contactId) {
      return res.status(400).json({ error: 'Некорректный contactId' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const before = req.query.before ? parseInt(req.query.before, 10) : null;

    const contactCheck = await pool.query(
      'SELECT id, service_type, external_id FROM messaging_contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Контакт не найден' });
    }

    const contactRow = contactCheck.rows[0];
    const syncContact = { id: contactRow.id, external_id: contactRow.external_id };

    if (!before) {
      let needSync = false;
      if (contactRow.service_type === 'whatsapp' && whatsappService?.hasClient(userId)) {
        needSync = await whatsappService.needsSync(pool, userId, syncContact);
      } else if (contactRow.service_type === 'telegram' && telegramService?.hasClient(userId)) {
        needSync = await telegramService.needsSync(pool, userId, syncContact);
      }
      if (needSync) {
        const cid = contactRow.id;
        const doEmitSynced = () => {
          if (io) io.to(`user:${userId}`).emit('messages:synced', { contactId: cid });
        };
        if (contactRow.service_type === 'whatsapp' && whatsappService?.hasClient(userId)) {
          whatsappService.fetchAndSyncChatHistory(pool, userId, syncContact)
            .then(doEmitSynced)
            .catch((e) => console.error('WhatsApp fetchAndSyncChatHistory:', e));
        } else if (contactRow.service_type === 'telegram' && telegramService?.hasClient(userId)) {
          telegramService.fetchAndSyncChatHistory(pool, userId, syncContact)
            .then(doEmitSynced)
            .catch((e) => console.error('Telegram fetchAndSyncChatHistory:', e));
        }
      }
    }

    let query = 'SELECT id, contact_id, direction, body, created_at, media_type, media_url, media_filename FROM chat_messages WHERE contact_id = $1 AND user_id = $2';
    const params = [contactId, userId];
    if (before) {
      query += ' AND id < $3 ORDER BY created_at DESC LIMIT $4';
      params.push(before, limit);
    } else {
      query += ' ORDER BY created_at DESC LIMIT $3';
      params.push(limit);
    }
    const r = await pool.query(query, params);
    const messages = r.rows.reverse();
    const hasMore = messages.length === limit;
    res.json({ success: true, messages, hasMore });
  } catch (e) {
    console.error('GET /api/messages/contacts/:contactId/messages:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/messages/contacts/:contactId/messages — отправить сообщение
router.post('/contacts/:contactId/messages', requireJwtAndLoadUser, requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const contactId = parseInt(req.params.contactId, 10);
    const { body } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'Некорректный contactId' });
    }
    const bodyTrim = typeof body === 'string' ? body.trim() : '';
    if (!bodyTrim) {
      return res.status(400).json({ error: 'Текст сообщения не может быть пустым' });
    }

    const contactCheck = await pool.query(
      'SELECT id, service_type, external_id FROM messaging_contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );
    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Контакт не найден' });
    }
    const contactRow = contactCheck.rows[0];

    const insert = await pool.query(
      `INSERT INTO chat_messages (user_id, contact_id, direction, body)
       VALUES ($1, $2, 'outgoing', $3)
       RETURNING id, contact_id, direction, body, created_at`,
      [userId, contactId, bodyTrim]
    );
    const message = insert.rows[0];

    if (contactRow.service_type === 'whatsapp' && whatsappService?.hasClient(userId)) {
      whatsappService.sendMessageViaWhatsApp(userId, contactRow.external_id, bodyTrim).catch((e) =>
        console.error('WhatsApp sendMessageViaWhatsApp:', e)
      );
    }
    if (contactRow.service_type === 'telegram' && telegramService?.hasClient(userId)) {
      telegramService.sendMessageViaTelegram(userId, contactRow.external_id, bodyTrim).catch((e) =>
        console.error('Telegram sendMessageViaTelegram:', e)
      );
    }

    await pool.query(
      `UPDATE messaging_contacts SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [contactId]
    );

    if (io) {
      io.to(`user:${userId}`).emit('messages:new', { contactId, message });
    }

    res.json({ success: true, message });
  } catch (e) {
    console.error('POST /api/messages/contacts/:contactId/messages:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

  return router;
}

/**
 * Восстановить WhatsApp-клиенты для пользователей с status=connected при старте сервера.
 * Иначе после перезапуска клиент не инициализирован, история не подтягивается.
 */
export async function restoreWhatsAppSessions(pool, io) {
  if (!whatsappService) return;
  try {
    const r = await pool.query(
      "SELECT user_id FROM messaging_services WHERE service_type = 'whatsapp' AND status = 'connected'"
    );
    for (const row of r.rows) {
      const userId = row.user_id;
      whatsappService.startConnection(userId, {
        pool,
        onQr: (qrDataUrl) => {
          if (io) io.to(`user:${userId}`).emit('messages:qr', { qr: qrDataUrl });
        },
        onReady: async (uid) => {
          await pool.query(
            `UPDATE messaging_services SET status = 'connected', updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND service_type = 'whatsapp'`,
            [uid]
          );
          await whatsappService.syncContactsToDb(pool, uid);
          if (io) io.to(`user:${uid}`).emit('messages:connected', { service_type: 'whatsapp' });
        },
        onAuthFailure: (msg) => {
          if (io) io.to(`user:${userId}`).emit('messages:qr_error', { message: msg || 'Ошибка авторизации' });
        },
        onIncomingMessage: (uid, contactId, message) => {
          if (io) io.to(`user:${uid}`).emit('messages:new', { contactId, message });
        }
      });
    }
    if (r.rows.length > 0) {
      console.log('[WhatsApp] restoreWhatsAppSessions: started', r.rows.length, 'client(s)');
    }
  } catch (e) {
    console.error('restoreWhatsAppSessions error:', e);
  }
}

export default createMessagesRouter;
