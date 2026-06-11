import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { getAllEnabledConfigs, updateConnectionStatus } from '../models/pluginConfig.mjs';

/**
 * TelegramConnectionManager - управляет постоянными подключениями к Telegram
 * Каждое подключение соответствует одному включённому плагину
 */
class TelegramConnectionManager {
  constructor() {
    /** @type {Map<string, {client: TelegramClient, config: object, userId: number}>} */
    this.connections = new Map();
    /** @type {Function|null} */
    this.messageHandler = null;
  }

  /**
   * Создать уникальный ключ для подключения
   */
  getConnectionKey(userId, projectId, elementId) {
    return `${userId}:${projectId}:${elementId}`;
  }

  /**
   * Установить обработчик входящих сообщений
   * @param {Function} handler - (message, connectionInfo) => void
   */
  setMessageHandler(handler) {
    this.messageHandler = handler;
  }

  /**
   * Подключить Telegram клиент для конкретной конфигурации
   */
  async connect({ userId, projectId, elementId, pluginId, config, sessionString }) {
    const key = this.getConnectionKey(userId, projectId, elementId);

    // Если уже подключен, отключаем старое подключение
    if (this.connections.has(key)) {
      console.log(`🔄 Reconnecting Telegram: ${key}`);
      await this.disconnect(userId, projectId, elementId);
    }

    try {
      const apiId = parseInt(config?.apiId, 10);
      const apiHash = String(config?.apiHash || '').trim();

      if (!apiId || !apiHash || !sessionString) {
        throw new Error('Telegram account mode requires apiId, apiHash, and sessionString');
      }

      console.log(`📡 Connecting Telegram: ${key}`);

      const client = new TelegramClient(
        new StringSession(sessionString),
        apiId,
        apiHash,
        {
          connectionRetries: 5,
          autoReconnect: true,
          useWSS: false
        }
      );

      await client.connect();

      // Проверяем авторизацию
      const me = await client.getMe();
      console.log(`✅ Telegram connected: ${key}, user: ${me.username || me.firstName || me.id}`);

      // Подписываемся на входящие сообщения
      client.addEventHandler((event) => {
        this.handleIncomingMessage(event, { userId, projectId, elementId, pluginId });
      }, new NewMessage({}));

      this.connections.set(key, { client, config, userId, projectId, elementId, pluginId });

      // Обновляем статус в БД
      await updateConnectionStatus({
        userId,
        projectId,
        elementId,
        status: 'connected',
        error: null
      });

      return { success: true, status: 'connected', username: me.username };
    } catch (e) {
      console.error(`❌ Telegram connection failed: ${key}`, e.message);

      await updateConnectionStatus({
        userId,
        projectId,
        elementId,
        status: 'connection_failed',
        error: e?.message || 'Connection failed'
      });

      throw e;
    }
  }

  /**
   * Отключить конкретное подключение
   */
  async disconnect(userId, projectId, elementId) {
    const key = this.getConnectionKey(userId, projectId, elementId);
    const conn = this.connections.get(key);

    if (!conn) return;

    try {
      await conn.client.disconnect();
      console.log(`🔌 Telegram disconnected: ${key}`);
    } catch (e) {
      console.error(`❌ Error disconnecting Telegram: ${key}`, e.message);
    }

    this.connections.delete(key);
  }

  /**
   * Отключить все подключения
   */
  async disconnectAll() {
    const promises = [];
    for (const [key, conn] of this.connections.entries()) {
      promises.push(
        conn.client.disconnect().catch(e => console.error(`Error disconnecting ${key}:`, e.message))
      );
    }
    await Promise.all(promises);
    this.connections.clear();
    console.log('🔌 All Telegram connections disconnected');
  }

  /**
   * Получить активное подключение
   */
  getConnection(userId, projectId, elementId) {
    const key = this.getConnectionKey(userId, projectId, elementId);
    return this.connections.get(key);
  }

  /**
   * Отправить сообщение через активное подключение
   */
  async sendMessage(userId, projectId, elementId, { chatId, message }) {
    const conn = this.getConnection(userId, projectId, elementId);

    if (!conn) {
      throw new Error('No active Telegram connection for this element');
    }

    try {
      await conn.client.sendMessage(chatId, { message });
      return { success: true };
    } catch (e) {
      console.error(`❌ Telegram sendMessage failed: ${userId}:${projectId}:${elementId}`, e.message);
      throw e;
    }
  }

  /**
   * Обработчик входящих сообщений
   */
  async handleIncomingMessage(event, connectionInfo) {
    try {
      const message = event.message;
      if (!message) return;

      const text = message.message || '';
      const from = await message.getSender();
      const chat = await message.getChat();

      const messageData = {
        id: message.id,
        text,
        date: message.date,
        from: {
          id: from?.id?.toString() || null,
          username: from?.username || null,
          firstName: from?.firstName || null,
          lastName: from?.lastName || null
        },
        chat: {
          id: chat?.id?.toString() || null,
          title: chat?.title || null,
          username: chat?.username || null
        }
      };

      console.log(`📨 Telegram message received: ${connectionInfo.userId}:${connectionInfo.projectId}:${connectionInfo.elementId}`, {
        from: messageData.from.username || messageData.from.id,
        text: text.slice(0, 50)
      });

      if (this.messageHandler) {
        await this.messageHandler(messageData, connectionInfo);
      }
    } catch (e) {
      console.error('❌ Error handling Telegram message:', e);
    }
  }

  /**
   * Загрузить все включённые конфигурации и подключиться
   */
  async loadAndConnectAll() {
    try {
      const configs = await getAllEnabledConfigs();
      console.log(`🔄 Loading ${configs.length} enabled Telegram plugin(s)`);

      for (const cfg of configs) {
        if (cfg.plugin_id !== 'telegram') continue;

        // Только для account mode нужно постоянное подключение
        const mode = cfg.config?.authMode || 'account';
        if (mode !== 'account') continue;

        try {
          await this.connect({
            userId: cfg.user_id,
            projectId: cfg.project_id,
            elementId: cfg.element_id,
            pluginId: cfg.plugin_id,
            config: cfg.config,
            sessionString: cfg.sessionString
          });
        } catch (e) {
          console.error(`❌ Failed to connect plugin: ${cfg.project_id}:${cfg.element_id}`, e.message);
        }
      }

      console.log(`✅ Telegram connections initialized: ${this.connections.size} active`);
    } catch (e) {
      console.error('❌ Error loading Telegram configs:', e);
    }
  }

  /**
   * Получить статус всех подключений
   */
  getStatus() {
    const status = [];
    for (const [key, conn] of this.connections.entries()) {
      status.push({
        key,
        userId: conn.userId,
        projectId: conn.projectId,
        elementId: conn.elementId,
        pluginId: conn.pluginId,
        connected: conn.client?.connected || false
      });
    }
    return status;
  }
}

// Singleton instance
const telegramConnectionManager = new TelegramConnectionManager();

export default telegramConnectionManager;
