/**
 * Интеграция Telegram через GramJS (MTProto): QR-код или телефон + код, сессия в БД, контакты, медиа.
 * API ID и API Hash: https://my.telegram.org → API development tools.
 * Переменные окружения: TELEGRAM_API_ID, TELEGRAM_API_HASH.
 */
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import QRCode from 'qrcode';

function getTelegramCredentials() {
  const id = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
  const hash = (process.env.TELEGRAM_API_HASH || '').trim();
  return { apiId: id, apiHash: hash, hasCredentials: id > 0 && hash.length > 0 };
}

let TelegramClient;
let StringSession;
let NewMessage;
let gramJsLoaded = false;

async function ensureGramJsLoaded() {
  if (gramJsLoaded) return;
  const { hasCredentials } = getTelegramCredentials();
  if (!hasCredentials) return;
  try {
    const telegram = await import('telegram');
    const sessions = await import('telegram/sessions/index.js');
    const events = await import('telegram/events/index.js');
    TelegramClient = telegram.TelegramClient;
    StringSession = sessions.StringSession;
    NewMessage = events.NewMessage;
    gramJsLoaded = true;
  } catch (e) {
    console.warn('Telegram (GramJS) import failed:', e.message);
  }
}

const MESSAGES_MEDIA_DIR = path.join(process.cwd(), 'uploads', 'messages');
const clients = new Map(); // userId -> { client, callbacks }
const pendingCode = new Map(); // userId -> { resolve, reject }
const pendingPassword = new Map(); // userId -> { resolve, reject }

const CODE_TIMEOUT_MS = 5 * 60 * 1000;

function ensureMessagesMediaDir() {
  if (!fs.existsSync(MESSAGES_MEDIA_DIR)) {
    fs.mkdirSync(MESSAGES_MEDIA_DIR, { recursive: true });
  }
}

function telegramMediaToType(media) {
  if (!media) return 'document';
  const c = media.className || media.constructor?.name || '';
  if (c.includes('Photo') || c.includes('PhotoEmpty')) return 'image';
  if (c.includes('Document')) return 'document';
  if (c.includes('Video') || c.includes('VideoEmpty')) return 'video';
  if (c.includes('Audio') || c.includes('Voice')) return 'audio';
  return 'document';
}

function getExtensionFromTelegramMedia(media, defaultExt = 'bin') {
  if (!media) return defaultExt;
  if (media.className === 'MessageMediaDocument' && media.document) {
    const doc = media.document;
    if (doc.attributes) {
      for (const a of doc.attributes) {
        if (a.className === 'DocumentAttributeFilename' && a.fileName) {
          const m = a.fileName.match(/\.([a-z0-9]+)$/i);
          if (m) return m[1];
        }
      }
    }
    return 'bin';
  }
  if (media.className === 'MessageMediaPhoto' || media.className === 'MessageMediaPhotoEmpty') return 'jpg';
  if (media.className === 'MessageMediaVideo' || media.className === 'MessageMediaVideoEmpty') return 'mp4';
  return defaultExt;
}

/**
 * Сохранить медиа из Telegram (Buffer) на диск.
 */
function saveTelegramMedia(userId, buffer, mediaType, filename) {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;
  ensureMessagesMediaDir();
  const ext = filename && /\.([a-z0-9]+)$/i.test(filename) ? filename.match(/\.([a-z0-9]+)$/i)[1] : (mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : 'bin');
  const safeName = `${userId}_${randomUUID()}.${ext}`;
  const filePath = path.join(MESSAGES_MEDIA_DIR, safeName);
  try {
    fs.writeFileSync(filePath, buffer);
    return {
      media_type: mediaType,
      media_url: `/api/messages/media/${safeName}`,
      media_filename: filename || null
    };
  } catch (e) {
    console.error('saveTelegramMedia error:', e);
    return null;
  }
}

/**
 * Запуск подключения Telegram по QR-коду (как WhatsApp).
 * callbacks: { pool, onQr(qrDataUrl), onReady(userId, sessionString), onAuthFailure(msg), onIncomingMessage?(userId, contactId, message) }
 */
export async function startConnectionWithQr(userId, callbacks) {
  const { apiId, apiHash, hasCredentials } = getTelegramCredentials();
  await ensureGramJsLoaded();
  if (!hasCredentials || !TelegramClient || !StringSession) {
    callbacks.onAuthFailure?.('Telegram API не настроен (TELEGRAM_API_ID, TELEGRAM_API_HASH)');
    return;
  }
  const { pool, onQr, onReady, onAuthFailure, onIncomingMessage } = callbacks;

  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5
  });

  clients.set(userId, { client, callbacks });

  function waitForPassword() {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (pendingPassword.has(userId)) {
          pendingPassword.delete(userId);
          reject(new Error('Время ожидания пароля истекло'));
        }
      }, CODE_TIMEOUT_MS);
      pendingPassword.set(userId, {
        resolve: (pwd) => {
          clearTimeout(t);
          pendingPassword.delete(userId);
          resolve(pwd);
        },
        reject: (err) => {
          clearTimeout(t);
          pendingPassword.delete(userId);
          reject(err);
        }
      });
      onAuthFailure?.('Требуется пароль 2FA. Используйте endpoint telegram-password.');
    });
  }

  (async () => {
    try {
      await client.connect();
      await client.signInUserWithQrCode(
        { apiId, apiHash },
        {
          qrCode: async ({ token, expires }) => {
            const url = `tg://login?token=${token.toString('base64url')}`;
            const qrDataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2 });
            onQr?.(qrDataUrl);
          },
          onError: async (err) => {
            console.error('Telegram QR onError:', err);
            onAuthFailure?.(err?.message || 'Ошибка входа');
            return true;
          },
          password: async () => await waitForPassword()
        }
      );

      const sessionString = client.session.save();
      const entry = clients.get(userId);
      if (entry?.callbacks?.onReady) {
        entry.callbacks.onReady(userId, sessionString);
      }
      if (pool && entry?.callbacks?.onIncomingMessage) {
        await setupNewMessageHandler(userId, pool, onIncomingMessage);
      }
    } catch (e) {
      console.error('Telegram startConnectionWithQr error:', e);
      clients.delete(userId);
      onAuthFailure?.(e?.message || 'Ошибка авторизации');
    }
  })();
}

/**
 * Запуск подключения Telegram для пользователя (телефон → код). Оставлено для совместимости.
 * callbacks: { pool, phone, onCodeRequest?(userId), onReady(userId, sessionString), onAuthFailure(msg), onIncomingMessage?(userId, contactId, message) }
 */
export async function startConnection(userId, callbacks) {
  const { apiId, apiHash, hasCredentials } = getTelegramCredentials();
  await ensureGramJsLoaded();
  if (!hasCredentials || !TelegramClient || !StringSession) {
    callbacks.onAuthFailure?.('Telegram API не настроен (TELEGRAM_API_ID, TELEGRAM_API_HASH)');
    return;
  }
  const { pool, phone, onCodeRequest, onReady, onAuthFailure, onIncomingMessage } = callbacks;
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    onAuthFailure?.('Укажите номер телефона');
    return;
  }

  const session = new StringSession('');
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5
  });

  clients.set(userId, { client, callbacks });

  function waitForCode() {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (pendingCode.has(userId)) {
          pendingCode.delete(userId);
          reject(new Error('Время ожидания кода истекло'));
        }
      }, CODE_TIMEOUT_MS);
      pendingCode.set(userId, {
        resolve: (code) => {
          clearTimeout(t);
          pendingCode.delete(userId);
          resolve(code);
        },
        reject: (err) => {
          clearTimeout(t);
          pendingCode.delete(userId);
          reject(err);
        }
      });
      onCodeRequest?.(userId);
    });
  }

  function waitForPassword() {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (pendingPassword.has(userId)) {
          pendingPassword.delete(userId);
          reject(new Error('Время ожидания пароля истекло'));
        }
      }, CODE_TIMEOUT_MS);
      pendingPassword.set(userId, {
        resolve: (pwd) => {
          clearTimeout(t);
          pendingPassword.delete(userId);
          resolve(pwd);
        },
        reject: (err) => {
          clearTimeout(t);
          pendingPassword.delete(userId);
          reject(err);
        }
      });
      onAuthFailure?.('Требуется пароль 2FA. Используйте endpoint telegram-password.');
    });
  }

  (async () => {
    try {
      await client.connect();
      await client.start({
        phoneNumber: async () => phone.trim(),
        phoneCode: async () => await waitForCode(),
        password: async () => await waitForPassword(),
        onError: (err) => {
          console.error('Telegram start error:', err);
          onAuthFailure?.(err?.message || 'Ошибка входа');
        }
      });

      const sessionString = client.session.save();
      const entry = clients.get(userId);
      if (entry?.callbacks?.onReady) {
        entry.callbacks.onReady(userId, sessionString);
      }
      if (pool && entry?.callbacks?.onIncomingMessage) {
        await setupNewMessageHandler(userId, pool, onIncomingMessage);
      }
    } catch (e) {
      console.error('Telegram startConnection error:', e);
      clients.delete(userId);
      onAuthFailure?.(e?.message || 'Ошибка авторизации');
    }
  })();
}

/**
 * Передать код из Telegram (вызывается из POST /api/messages/services/telegram-code).
 */
export function submitCode(userId, code) {
  const pending = pendingCode.get(userId);
  if (!pending) {
    return false;
  }
  pending.resolve(String(code).trim());
  return true;
}

/**
 * Передать пароль 2FA (опционально, для POST telegram-password).
 */
export function submitPassword(userId, password) {
  const pending = pendingPassword.get(userId);
  if (!pending) return false;
  pending.resolve(String(password));
  return true;
}

async function setupNewMessageHandler(userId, pool, onIncomingMessage) {
  const entry = clients.get(userId);
  const client = entry?.client;
  if (!client?.addEventHandler) return;

  client.addEventHandler(
    async (event) => {
      try {
        const message = event.message;
        if (!message?.out && message.text !== undefined) {
          const senderId = message.senderId?.toString?.() || message.peerId?.userId?.toString?.() || message.peerId?.channelId?.toString?.() || message.chatId?.toString?.();
          if (!senderId) return;
          const externalId = String(senderId);
          let r = await pool.query(
            'SELECT id FROM messaging_contacts WHERE user_id = $1 AND service_type = $2 AND external_id = $3',
            [userId, 'telegram', externalId]
          );
          let contactId;
          if (r.rows.length > 0) {
            contactId = r.rows[0].id;
          } else {
            let displayName = externalId;
            try {
              const entity = await client.getEntity(message.peerId);
              displayName = entity.title || (entity.firstName && entity.lastName ? `${entity.firstName} ${entity.lastName}`.trim() : entity.firstName || entity.lastName) || (entity.username ? `@${entity.username}` : null) || externalId;
            } catch (_) {}
            const ins = await pool.query(
              `INSERT INTO messaging_contacts (user_id, service_type, external_id, display_name)
               VALUES ($1, 'telegram', $2, $3)
               ON CONFLICT (user_id, service_type, external_id) DO UPDATE SET display_name = $3 RETURNING id`,
              [userId, externalId, displayName]
            );
            if (ins.rows.length === 0) return;
            contactId = ins.rows[0].id;
          }
          let body = (message.text || '').trim() || '(медиа)';
          let mediaType = null;
          let mediaUrl = null;
          let mediaFilename = null;
          if (message.media) {
            try {
              const buf = await client.downloadMedia(message.media);
              if (buf && Buffer.isBuffer(buf)) {
                const mediaType_ = telegramMediaToType(message.media);
                const ext = getExtensionFromTelegramMedia(message.media);
                const filename = message.media.document?.attributes?.find?.(a => a.className === 'DocumentAttributeFilename')?.fileName || null;
                const saved = saveTelegramMedia(userId, buf, mediaType_, filename);
                if (saved) {
                  mediaType = saved.media_type;
                  mediaUrl = saved.media_url;
                  mediaFilename = saved.media_filename;
                  if (body === '(медиа)') body = '';
                }
              }
            } catch (err) {
              console.error('Telegram incoming downloadMedia error:', err);
            }
          }
          const externalMsgId = message.id != null ? `tg_${contactId}_${message.id}` : null;
          const createdAt = message.date ? new Date(message.date * 1000) : new Date();
          const ins = await pool.query(
            `INSERT INTO chat_messages (user_id, contact_id, direction, body, created_at, external_message_id, media_type, media_url, media_filename)
             VALUES ($1, $2, 'incoming', $3, $4, $5, $6, $7, $8)
             ON CONFLICT (contact_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING
             RETURNING id, contact_id, direction, body, created_at, media_type, media_url, media_filename`,
            [userId, contactId, body || '(медиа)', createdAt, externalMsgId || `in_${Date.now()}_${Math.random()}`, mediaType, mediaUrl, mediaFilename]
          );
          if (ins.rows.length > 0) {
            await pool.query(
              `UPDATE messaging_contacts SET last_message_at = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
              [createdAt, contactId]
            );
            onIncomingMessage(userId, contactId, ins.rows[0]);
          }
        }
      } catch (e) {
        console.error('Telegram new message handler error:', e);
      }
    },
    new NewMessage({ incoming: true, outgoing: false })
  );
}

export function getClient(userId) {
  return clients.get(userId)?.client ?? null;
}

export function hasClient(userId) {
  const entry = clients.get(userId);
  return entry?.client != null;
}

/**
 * Синхронизация диалогов Telegram в messaging_contacts.
 */
export async function syncContactsToDb(pool, userId) {
  const client = getClient(userId);
  if (!client?.getDialogs) return;
  try {
    const dialogs = await client.getDialogs({});
    for (const dialog of dialogs) {
      if (!dialog.entity) continue;
      const peerId = dialog.id?.toString?.() || String(dialog.id);
      const title = dialog.title || dialog.name || peerId;
      const isUser = dialog.entity.className === 'User' && !dialog.entity.bot;
      const isChat = dialog.entity.className === 'Chat';
      const isChannel = dialog.entity.className === 'Channel';
      if (!isUser && !isChat && !isChannel) continue;
      if (isChannel && dialog.entity.broadcast) continue;
      await pool.query(
        `INSERT INTO messaging_contacts (user_id, service_type, external_id, display_name)
         VALUES ($1, 'telegram', $2, $3)
         ON CONFLICT (user_id, service_type, external_id) DO UPDATE SET display_name = $3, updated_at = CURRENT_TIMESTAMP`,
        [userId, peerId, title]
      );
    }
  } catch (e) {
    console.error('Telegram syncContactsToDb error:', e);
  }
}

const HISTORY_LIMIT = 200;
const HISTORY_SYNC_DELAY_MS = 500;

export async function syncAllHistoriesInBackground(pool, userId) {
  try {
    const r = await pool.query(
      'SELECT id, external_id FROM messaging_contacts WHERE user_id = $1 AND service_type = $2',
      [userId, 'telegram']
    );
    for (const row of r.rows) {
      await fetchAndSyncChatHistory(pool, userId, { id: row.id, external_id: row.external_id });
      await new Promise((r) => setTimeout(r, HISTORY_SYNC_DELAY_MS));
    }
  } catch (e) {
    console.error('Telegram syncAllHistoriesInBackground error:', e);
  }
}

/**
 * Проверить, синхронизирован ли чат: запросить последнее сообщение, есть ли оно в БД.
 * Возвращает true если нужна синхронизация (последнего нет в БД).
 */
export async function needsSync(pool, userId, contact) {
  const client = getClient(userId);
  if (!client?.getMessages || !contact?.id || contact.external_id == null) return false;
  try {
    let entity;
    const extId = String(contact.external_id).trim();
    const num = parseInt(extId, 10);
    entity = String(num) === extId ? num : extId;
    const messages = await client.getMessages(entity, { limit: 1 });
    if (!messages?.length) return false;
    const msg = messages[0];
    const externalMsgId = msg.id != null ? `tg_${contact.id}_${msg.id}` : null;
    if (!externalMsgId) return true;
    const r = await pool.query(
      'SELECT 1 FROM chat_messages WHERE contact_id = $1 AND external_message_id = $2 LIMIT 1',
      [contact.id, externalMsgId]
    );
    return r.rows.length === 0;
  } catch (_) {
    return true;
  }
}

/**
 * Подтянуть историю сообщений из Telegram для контакта.
 */
export async function fetchAndSyncChatHistory(pool, userId, contact) {
  const client = getClient(userId);
  if (!client?.getMessages || !contact?.id || contact.external_id == null) return;
  try {
    let entity;
    const extId = String(contact.external_id).trim();
    const num = parseInt(extId, 10);
    if (String(num) === extId) {
      entity = num;
    } else {
      entity = extId;
    }
    const messages = await client.getMessages(entity, { limit: HISTORY_LIMIT });
    if (!messages || !messages.length) return;
    for (const msg of messages) {
      const body = (msg.text || '').trim();
      const direction = msg.out ? 'outgoing' : 'incoming';
      const externalMsgId = msg.id != null ? `tg_${contact.id}_${msg.id}` : `tg_${contact.id}_${msg.date || 0}_${direction}_${messages.indexOf(msg)}`;
      const bodyText = body || '(медиа)';
      const createdAt = msg.date ? new Date(msg.date * 1000) : new Date();
      let mediaType = null;
      let mediaUrl = null;
      let mediaFilename = null;
      if (msg.media) {
        try {
          const buf = await client.downloadMedia(msg.media);
          if (buf && Buffer.isBuffer(buf)) {
            const mt = telegramMediaToType(msg.media);
            const filename = msg.media.document?.attributes?.find?.(a => a.className === 'DocumentAttributeFilename')?.fileName || null;
            const saved = saveTelegramMedia(userId, buf, mt, filename);
            if (saved) {
              mediaType = saved.media_type;
              mediaUrl = saved.media_url;
              mediaFilename = saved.media_filename;
            }
          }
        } catch (err) {
          console.error('Telegram fetchAndSyncChatHistory downloadMedia error:', err);
        }
      }
      await pool.query(
        `INSERT INTO chat_messages (user_id, contact_id, direction, body, created_at, external_message_id, media_type, media_url, media_filename)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (contact_id, external_message_id) WHERE external_message_id IS NOT NULL DO NOTHING`,
        [userId, contact.id, direction, bodyText, createdAt, externalMsgId, mediaType, mediaUrl, mediaFilename]
      );
    }
    await pool.query(
      `UPDATE messaging_contacts SET last_message_at = (SELECT MAX(created_at) FROM chat_messages WHERE contact_id = $1), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [contact.id]
    );
  } catch (e) {
    console.error('Telegram fetchAndSyncChatHistory error:', e);
  }
}

/**
 * Отправить сообщение в Telegram.
 */
export async function sendMessageViaTelegram(userId, contactExternalId, body) {
  const client = getClient(userId);
  if (!client?.sendMessage) return false;
  try {
    const extId = String(contactExternalId).trim();
    const num = parseInt(extId, 10);
    const entity = String(num) === extId ? num : extId;
    await client.sendMessage(entity, { message: body });
    return true;
  } catch (e) {
    console.error('Telegram sendMessageViaTelegram error:', e);
    return false;
  }
}

/**
 * Восстановить сессии Telegram из БД при старте сервера.
 */
export async function restoreTelegramSessions(pool, io) {
  const { apiId, apiHash, hasCredentials } = getTelegramCredentials();
  await ensureGramJsLoaded();
  if (!hasCredentials || !TelegramClient || !StringSession) return;
  try {
    const r = await pool.query(
      "SELECT user_id, session_data FROM messaging_services WHERE service_type = 'telegram' AND status = 'connected' AND session_data IS NOT NULL AND session_data != ''"
    );
    for (const row of r.rows) {
      const userId = row.user_id;
      const sessionString = row.session_data;
      if (!sessionString) continue;
      const session = new StringSession(sessionString);
      const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
      clients.set(userId, {
        client,
        callbacks: {
          pool,
          onReady: () => {},
          onAuthFailure: () => {},
          onIncomingMessage: (uid, contactId, message) => {
            if (io) io.to(`user:${uid}`).emit('messages:new', { contactId, message });
          }
        }
      });
      (async () => {
        try {
          await client.connect();
          if (!(await client.isUserAuthorized())) {
            clients.delete(userId);
            await pool.query(
              `UPDATE messaging_services SET status = 'disconnected', session_data = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND service_type = 'telegram'`,
              [userId]
            );
            return;
          }
          await setupNewMessageHandler(userId, pool, (uid, contactId, message) => {
            if (io) io.to(`user:${uid}`).emit('messages:new', { contactId, message });
          });
          syncContactsToDb(pool, userId).catch((e) => console.error('restoreTelegram syncContacts:', e));
        } catch (e) {
          console.error('Telegram restore session error for user', userId, e);
          clients.delete(userId);
        }
      })();
    }
  } catch (e) {
    console.error('restoreTelegramSessions error:', e);
  }
}
