/**
 * Интеграция WhatsApp через whatsapp-web.js: QR, сессия, контакты, медиа.
 */
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import QRCode from 'qrcode';

const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require('whatsapp-web.js');

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'whatsapp-sessions');
const MESSAGES_MEDIA_DIR = path.join(process.cwd(), 'uploads', 'messages');

const clients = new Map(); // userId -> { client, callbacks }

function ensureSessionsDir() {
  const dir = path.join(SESSIONS_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureMessagesMediaDir() {
  if (!fs.existsSync(MESSAGES_MEDIA_DIR)) {
    fs.mkdirSync(MESSAGES_MEDIA_DIR, { recursive: true });
  }
}

function mimetypeToMediaType(mimetype) {
  if (!mimetype || typeof mimetype !== 'string') return 'document';
  const m = mimetype.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'document';
}

function getExtension(mimetype, filename) {
  if (filename && /\.([a-z0-9]+)$/i.test(filename)) return filename.match(/\.([a-z0-9]+)$/i)[1];
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac'
  };
  return map[mimetype?.toLowerCase()] || 'bin';
}

/**
 * Сохранить медиа из WhatsApp на диск. media: { data (base64), mimetype, filename? }.
 * Возвращает { media_type, media_url, media_filename } или null при ошибке.
 */
export function saveMessageMedia(userId, media) {
  if (!media?.data) return null;
  ensureMessagesMediaDir();
  const mediaType = mimetypeToMediaType(media.mimetype);
  const ext = getExtension(media.mimetype, media.filename);
  const safeName = `${userId}_${randomUUID()}.${ext}`;
  const filePath = path.join(MESSAGES_MEDIA_DIR, safeName);
  try {
    const buf = Buffer.from(media.data, 'base64');
    fs.writeFileSync(filePath, buf);
    return {
      media_type: mediaType,
      media_url: `/api/messages/media/${safeName}`,
      media_filename: media.filename || null
    };
  } catch (e) {
    console.error('saveMessageMedia error:', e);
    return null;
  }
}

/**
 * Запуск подключения WhatsApp для пользователя.
 * callbacks: { onQr(qrDataUrl), onReady(userId), onAuthFailure(msg), pool?, onIncomingMessage?(userId, contactId, message) }
 */
export function startConnection(userId, callbacks) {
  if (clients.has(userId)) {
    const entry = clients.get(userId);
    entry.callbacks = callbacks;
    if (entry.client.info) {
      try {
        callbacks.onReady?.(userId);
      } catch (e) {
        console.error('WhatsApp onReady callback error:', e);
      }
      return;
    }
    entry.client.initialize().catch((e) => {
      console.error('WhatsApp initialize error:', e);
      callbacks.onAuthFailure?.(e?.message || 'Ошибка инициализации');
    });
    return;
  }

  ensureSessionsDir();

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: String(userId),
      dataPath: SESSIONS_DIR
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  clients.set(userId, { client, callbacks });

  client.on('qr', async (qr) => {
    try {
      const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
      const entry = clients.get(userId);
      if (entry?.callbacks?.onQr) entry.callbacks.onQr(qrDataUrl);
    } catch (e) {
      console.error('QR toDataURL error:', e);
    }
  });

  client.on('ready', () => {
    const entry = clients.get(userId);
    if (entry?.callbacks?.onReady) {
      try {
        entry.callbacks.onReady(userId);
      } catch (e) {
        console.error('WhatsApp onReady callback error:', e);
      }
    }
  });

  client.on('message', async (msg) => {
    if (msg.fromMe) return;
    const entry = clients.get(userId);
    const pool = entry?.callbacks?.pool;
    if (!pool || !entry?.callbacks?.onIncomingMessage) return;
    try {
      const from = msg.from?.replace?.('@c.us', '').replace?.('@s.whatsapp.net', '') || msg.from;
      let r = await pool.query(
        'SELECT id FROM messaging_contacts WHERE user_id = $1 AND service_type = $2 AND external_id = $3',
        [userId, 'whatsapp', from]
      );
      let contactId;
      if (r.rows.length > 0) {
        contactId = r.rows[0].id;
      } else {
        const chat = await entry.client.getChatById?.(msg.from);
        const displayName = chat?.name || from;
        const ins = await pool.query(
          `INSERT INTO messaging_contacts (user_id, service_type, external_id, display_name)
           VALUES ($1, 'whatsapp', $2, $3)
           ON CONFLICT (user_id, service_type, external_id) DO UPDATE SET display_name = $3 RETURNING id`,
          [userId, from, displayName]
        );
        if (ins.rows.length === 0) return;
        contactId = ins.rows[0].id;
      }
      let body = (msg.body || '').trim() || '(медиа)';
      let mediaType = null;
      let mediaUrl = null;
      let mediaFilename = null;
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media?.data) {
            const saved = saveMessageMedia(userId, media);
            if (saved) {
              mediaType = saved.media_type;
              mediaUrl = saved.media_url;
              mediaFilename = saved.media_filename;
              if (body === '(медиа)') body = '';
            }
          }
        } catch (err) {
          console.error('WhatsApp incoming message downloadMedia error:', err);
        }
      }
      const externalId = msg.id?._serialized || (msg.id && typeof msg.id === 'object' ? JSON.stringify(msg.id) : null);
      const createdAt = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();
      const ins = await pool.query(
        `INSERT INTO chat_messages (user_id, contact_id, direction, body, created_at, external_message_id, media_type, media_url, media_filename)
         VALUES ($1, $2, 'incoming', $3, $4, $5, $6, $7, $8)
         ON CONFLICT (contact_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
         RETURNING id, contact_id, direction, body, created_at, media_type, media_url, media_filename`,
        [userId, contactId, body || '(медиа)', createdAt, externalId || `incoming_${Date.now()}_${Math.random()}`, mediaType, mediaUrl, mediaFilename]
      );
      if (ins.rows.length > 0) {
        await pool.query(
          `UPDATE messaging_contacts SET last_message_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [createdAt, contactId]
        );
        entry.callbacks.onIncomingMessage(userId, contactId, ins.rows[0]);
      }
    } catch (e) {
      console.error('WhatsApp incoming message handler error:', e);
    }
  });

  client.on('auth_failure', (msg) => {
    const entry = clients.get(userId);
    if (entry?.callbacks?.onAuthFailure) entry.callbacks.onAuthFailure(msg || 'Ошибка авторизации');
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected for user', userId, reason);
  });

  client.initialize().catch((e) => {
    console.error('WhatsApp initialize error:', e);
    const entry = clients.get(userId);
    if (entry?.callbacks?.onAuthFailure) entry.callbacks.onAuthFailure(e?.message || 'Ошибка инициализации');
  });
}

/**
 * Получить клиент WhatsApp для пользователя (если подключён).
 */
export function getClient(userId) {
  return clients.get(userId)?.client ?? null;
}

/**
 * Есть ли активный клиент для пользователя.
 */
export function hasClient(userId) {
  const entry = clients.get(userId);
  return entry?.client?.info != null;
}

/**
 * Синхронизация чатов WhatsApp в messaging_contacts.
 */
export async function syncContactsToDb(pool, userId) {
  const client = getClient(userId);
  if (!client?.getChats) return;

  try {
    const chats = await client.getChats();
    for (const chat of chats) {
      const id = chat.id?._serialized || chat.id;
      if (!id) continue;
      const isGroup = chat.isGroup;
      const name = chat.name || id.split('@')[0] || id;
      if (isGroup) continue;
      const externalId = id.replace('@c.us', '').replace('@s.whatsapp.net', '');
      await pool.query(
        `INSERT INTO messaging_contacts (user_id, service_type, external_id, display_name)
         VALUES ($1, 'whatsapp', $2, $3)
         ON CONFLICT (user_id, service_type, external_id) DO UPDATE SET display_name = $3, updated_at = CURRENT_TIMESTAMP`,
        [userId, externalId, name]
      );
    }
  } catch (e) {
    console.error('WhatsApp syncContactsToDb error:', e);
  }
}

const HISTORY_LIMIT = 200;
const HISTORY_SYNC_DELAY_MS = 800;

/**
 * Фоновая подтяжка истории по всем WhatsApp-контактам после подключения.
 */
export async function syncAllHistoriesInBackground(pool, userId) {
  try {
    const r = await pool.query(
      'SELECT id, external_id FROM messaging_contacts WHERE user_id = $1 AND service_type = $2',
      [userId, 'whatsapp']
    );
    for (const row of r.rows) {
      await fetchAndSyncChatHistory(pool, userId, { id: row.id, external_id: row.external_id });
      await new Promise((resolve) => setTimeout(resolve, HISTORY_SYNC_DELAY_MS));
    }
  } catch (e) {
    console.error('WhatsApp syncAllHistoriesInBackground error:', e);
  }
}

function normalizeWhatsAppId(externalId) {
  if (!externalId || typeof externalId !== 'string') return '';
  const cleaned = externalId.replace(/[@\s\-\(\)]/g, '').replace(/^\+/, '');
  return cleaned.replace(/\D/g, '') || externalId;
}

/**
 * Проверить, синхронизирован ли чат: запросить последнее сообщение, есть ли оно в БД.
 * Возвращает true если нужна синхронизация (последнего нет в БД).
 */
export async function needsSync(pool, userId, contact) {
  const client = getClient(userId);
  if (!client?.getChatById || !contact?.id || !contact?.external_id) return false;
  const rawId = String(contact.external_id).trim();
  const normalized = normalizeWhatsAppId(rawId);
  const chatIdsToTry = rawId.includes('@') ? [rawId] : [`${normalized}@c.us`, `${normalized}@s.whatsapp.net`];
  let chat = null;
  for (const chatId of chatIdsToTry) {
    try {
      chat = await client.getChatById(chatId);
      if (chat?.fetchMessages) break;
    } catch (_) {}
  }
  if (!chat?.fetchMessages) return false;
  try {
    const messages = await chat.fetchMessages({ limit: 1 });
    if (!messages?.length) return false;
    const msg = messages[0];
    const idObj = msg.id;
    const externalId =
      idObj?._serialized ||
      (idObj && typeof idObj === 'object' && idObj.remote != null && idObj.id != null
        ? `${idObj.fromMe}_${typeof idObj.remote === 'string' ? idObj.remote : idObj.remote?._serialized || ''}_${idObj.id}`
        : null);
    const extId = externalId || `wa_${contact.id}_${msg.timestamp || 0}_${msg.fromMe ? 'outgoing' : 'incoming'}_0`;
    const r = await pool.query(
      'SELECT 1 FROM chat_messages WHERE contact_id = $1 AND external_message_id = $2 LIMIT 1',
      [contact.id, extId]
    );
    return r.rows.length === 0;
  } catch (_) {
    return true;
  }
}

/**
 * Подтянуть историю сообщений из WhatsApp для контакта и сохранить в chat_messages.
 * contact: { id: contact_id (our DB id), external_id: WhatsApp number }
 */
export async function fetchAndSyncChatHistory(pool, userId, contact) {
  const client = getClient(userId);
  if (!client?.getChatById || !contact?.id || !contact?.external_id) {
    if (!getClient(userId)) console.warn('[WhatsApp] fetchAndSyncChatHistory: client not ready for user', userId);
    return;
  }

  const rawId = String(contact.external_id).trim();
  const normalized = normalizeWhatsAppId(rawId);
  const chatIdsToTry = rawId.includes('@')
    ? [rawId]
    : [`${normalized}@c.us`, `${normalized}@s.whatsapp.net`];

  let chat = null;
  for (const chatId of chatIdsToTry) {
    try {
      chat = await client.getChatById(chatId);
      if (chat?.fetchMessages) break;
    } catch (err) {
      // try next format
    }
  }

  if (!chat?.fetchMessages) {
    console.warn('[WhatsApp] fetchAndSyncChatHistory: chat not found or no fetchMessages', { contactId: contact.id, tried: chatIdsToTry });
    return;
  }

  try {
    const messages = await chat.fetchMessages({ limit: HISTORY_LIMIT });
    for (let idx = 0; idx < messages.length; idx++) {
      const msg = messages[idx];
      let body = (msg.body || '').trim();
      const direction = msg.fromMe ? 'outgoing' : 'incoming';
      let mediaType = null;
      let mediaUrl = null;
      let mediaFilename = null;
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media?.data) {
            const saved = saveMessageMedia(userId, media);
            if (saved) {
              mediaType = saved.media_type;
              mediaUrl = saved.media_url;
              mediaFilename = saved.media_filename;
              if (!body) body = '';
            }
          }
        } catch (err) {
          console.error('WhatsApp fetchAndSyncChatHistory downloadMedia error:', err);
        }
      }
      const bodyText = body || '(медиа)';
      const idObj = msg.id;
      const externalId =
        idObj?._serialized ||
        (idObj && typeof idObj === 'object' && idObj.remote != null && idObj.id != null
          ? `${idObj.fromMe}_${typeof idObj.remote === 'string' ? idObj.remote : idObj.remote?._serialized || ''}_${idObj.id}`
          : null);
      const createdAt = msg.timestamp ? new Date(msg.timestamp * 1000) : new Date();
      const extId = externalId || `wa_${contact.id}_${msg.timestamp || 0}_${direction}_${idx}`;

      await pool.query(
        `INSERT INTO chat_messages (user_id, contact_id, direction, body, created_at, external_message_id, media_type, media_url, media_filename)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (contact_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING`,
        [userId, contact.id, direction, bodyText, createdAt, extId, mediaType, mediaUrl, mediaFilename]
      );
    }

    if (messages.length > 0) {
      await pool.query(
        `UPDATE messaging_contacts SET last_message_at = (SELECT MAX(created_at) FROM chat_messages WHERE contact_id = $1), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [contact.id]
      );
    }
  } catch (e) {
    console.error('WhatsApp fetchAndSyncChatHistory error:', e);
  }
}

/**
 * Отправить сообщение в WhatsApp от имени пользователя.
 * contactExternalId — номер без @c.us.
 */
export async function sendMessageViaWhatsApp(userId, contactExternalId, body) {
  const client = getClient(userId);
  if (!client?.getChatById) return false;
  try {
    const chatId = contactExternalId.includes('@') ? contactExternalId : `${contactExternalId}@c.us`;
    const chat = await client.getChatById(chatId);
    if (!chat?.sendMessage) return false;
    await chat.sendMessage(body);
    return true;
  } catch (e) {
    console.error('WhatsApp sendMessageViaWhatsApp error:', e);
    return false;
  }
}
