# Telegram Integration - Постоянное подключение

## Обзор

Реализована полноценная интеграция с Telegram с постоянным подключением к серверам Telegram. При включении плагина:

1. **Session String шифруется** и сохраняется в БД (таблица `plugin_configs`)
2. **Автоматически создаётся постоянное подключение** при запуске сервера
3. **Входящие сообщения** обрабатываются в реальном времени
4. **Исходящие сообщения** отправляются через активное подключение

## Архитектура

### База данных

**Таблица `plugin_configs`:**
```sql
- id: SERIAL PRIMARY KEY
- user_id: INT (FK users.id)
- project_id: VARCHAR(100)
- element_id: VARCHAR(100)
- plugin_id: VARCHAR(50)  -- 'telegram'
- enabled: BOOLEAN
- config: JSONB  -- {apiId, apiHash, authMode, ...}
- encrypted_session: TEXT  -- Зашифрованный sessionString
- connection_status: VARCHAR(50)  -- 'connected', 'not_tested', 'connection_failed'
- last_tested_at: TIMESTAMP
- last_error: TEXT
```

**Шифрование:** AES-256-CBC, ключ из `process.env.PLUGIN_ENCRYPTION_KEY` (или генерируется автоматически)

### Backend

**Модули:**
- `server/models/pluginConfig.mjs` - работа с БД
- `server/plugins/telegramConnectionManager.mjs` - менеджер подключений
- `server/routes/plugins.mjs` - API endpoints

**TelegramConnectionManager:**
- Singleton, управляет Map<connectionKey, {client, config}>
- Автоматически подключается при `loadAndConnectAll()` (вызывается в server.mjs)
- Обрабатывает входящие сообщения через `NewMessage` event
- Поддерживает reconnect (autoReconnect: true)

### API Endpoints

#### Конфигурация

```http
POST /api/plugins/config/save
Body: { projectId, elementId, pluginId, enabled, config: { apiId, apiHash, sessionString, ... } }
→ Сохраняет конфигурацию, шифрует sessionString
```

```http
GET /api/plugins/config/:projectId/:elementId
→ Возвращает конфигурацию с расшифрованным sessionString
```

```http
DELETE /api/plugins/config/:projectId/:elementId
→ Удаляет конфигурацию, отключает Telegram
```

#### Telegram операции

```http
POST /api/plugins/telegram/send
Body: { projectId, elementId, chatId, message }
→ Отправить сообщение через активное подключение
```

```http
GET /api/plugins/telegram/status
→ Получить статус всех активных подключений
```

```http
POST /api/plugins/telegram/connect
Body: { projectId, elementId }
→ Вручную подключить/переподключить
```

```http
POST /api/plugins/telegram/disconnect
Body: { projectId, elementId }
→ Отключить подключение
```

## Использование

### 1. Генерация Session String

```bash
cd /home/sever/WebstormProjects/aiternitas
node scripts/plugins/telegram/generate-session.mjs
```

**Входные данные:**
- API ID: `35115172`
- API Hash: `3a86bee7a54b8b364f4532c2dc6f91af`
- Номер телефона: `+79991234567`
- Код из Telegram: получить в приложении
- Пароль 2FA (если включен)

**Результат:** Session String (длинная base64-строка)

### 2. Настройка в интерфейсе

1. Откройте плагин Telegram в элементе flowchart
2. Выберите режим "Telegram аккаунт (серверно, MTProto)"
3. Заполните:
   - API ID
   - API Hash
   - Session String (вставьте сгенерированную строку)
4. Включите плагин (`enabled: true`)
5. Нажмите "Сохранить"

### 3. Автоматическое подключение

При сохранении (если `enabled: true` и `authMode: 'account'`):
- Конфигурация сохраняется в БД
- Session String шифруется
- При следующем запуске сервера создаётся постоянное подключение

### 4. Отправка сообщений

**Через API:**
```javascript
const response = await fetch('/api/plugins/telegram/send', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'my-project',
    elementId: 'elem-123',
    chatId: 'me',  // или ID чата/канала
    message: 'Привет из Aiternitas!'
  })
});
```

**Через менеджер (серверный код):**
```javascript
import telegramConnectionManager from './server/plugins/telegramConnectionManager.mjs';

await telegramConnectionManager.sendMessage(userId, projectId, elementId, {
  chatId: 'me',
  message: 'Hello!'
});
```

### 5. Получение входящих сообщений

**Socket.IO (фронтенд):**
```javascript
import socketService from './services/socket';

socketService.on('telegram:message', (data) => {
  console.log('Telegram message:', data.text);
  console.log('From:', data.from.username);
  console.log('Plugin:', data.connectionInfo);
});
```

**Обработчик (backend):**
```javascript
telegramConnectionManager.setMessageHandler(async (message, connectionInfo) => {
  console.log(`📨 Message from ${message.from.username}: ${message.text}`);
  // Обработка сообщения
});
```

## Безопасность

1. **Session String шифруется** при сохранении (AES-256-CBC)
2. **Ключ шифрования** должен быть задан в `.env`:
   ```bash
   PLUGIN_ENCRYPTION_KEY=your_64_char_hex_key_here
   ```
   Если не задан, генерируется случайный (но тогда при перезапуске старые сессии не расшифруются!)

3. **Все endpoints защищены** `requireAuth` middleware
4. **Rate limiting** на `/api/plugins/test` (10 запросов/минута)

## Мониторинг

**Логи:**
- `🔄 Loading N enabled Telegram plugin(s)` - загрузка конфигураций
- `📡 Connecting Telegram: userId:projectId:elementId` - подключение
- `✅ Telegram connected: ..., user: username` - успешное подключение
- `📨 Telegram message received: ...` - входящее сообщение
- `📤 Telegram message sent: ... -> chatId` - исходящее сообщение
- `❌ Telegram connection failed: ...` - ошибка подключения

**Статус:**
```bash
curl http://localhost:3001/api/plugins/telegram/status
```

**Console output при старте:**
```
✅ Таблица plugin_configs создана/проверена
🔄 Loading 2 enabled Telegram plugin(s)
📡 Connecting Telegram: 1:project-1:elem-123
✅ Telegram connected: 1:project-1:elem-123, user: myusername
✅ Telegram connections initialized: 1 active
📡 Telegram connections: 1 active
```

## Graceful Shutdown

При завершении сервера (SIGINT/SIGTERM):
```javascript
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await telegramConnectionManager.disconnectAll();
  process.exit(0);
});
```

Все Telegram подключения корректно отключаются.

## Troubleshooting

### Ошибка "Not a valid string"

**Причина:** Неверный Session String

**Решение:**
1. Перегенерируйте session: `node scripts/plugins/telegram/generate-session.mjs`
2. Убедитесь, что скопировали всю строку (она очень длинная!)

### Подключение не создаётся

**Проверьте:**
1. `enabled: true` в конфигурации
2. `authMode: 'account'` (не 'bot')
3. Session String заполнен и валиден
4. Логи сервера: `❌ Telegram connection failed: ...`

### Входящие сообщения не приходят

**Проверьте:**
1. Подключение активно: `/api/plugins/telegram/status`
2. Socket.IO подключен: `socketService.isConnected`
3. Обработчик установлен: `telegramConnectionManager.messageHandler !== null`

## Пример полного workflow

1. **Генерация session:**
   ```bash
   node scripts/plugins/telegram/generate-session.mjs
   # Вводим данные, получаем Session String
   ```

2. **Сохранение конфигурации:**
   ```javascript
   await fetch('/api/plugins/config/save', {
     method: 'POST',
     credentials: 'include',
     body: JSON.stringify({
       projectId: 'aiternitas',
       elementId: 'root',
       pluginId: 'telegram',
       enabled: true,
       config: {
         authMode: 'account',
         apiId: '35115172',
         apiHash: '3a86bee7a54b8b364f4532c2dc6f91af',
         sessionString: 'AQG...очень длинная строка...'
       }
     })
   });
   ```

3. **Подключение (автоматически при restart или вручную):**
   ```javascript
   await fetch('/api/plugins/telegram/connect', {
     method: 'POST',
     credentials: 'include',
     body: JSON.stringify({ projectId: 'aiternitas', elementId: 'root' })
   });
   ```

4. **Отправка сообщения:**
   ```javascript
   await fetch('/api/plugins/telegram/send', {
     method: 'POST',
     credentials: 'include',
     body: JSON.stringify({
       projectId: 'aiternitas',
       elementId: 'root',
       chatId: 'me',
       message: 'Работает!'
     })
   });
   ```

5. **Получение входящих:**
   ```javascript
   socketService.on('telegram:message', (msg) => {
     alert(`Новое сообщение от ${msg.from.username}: ${msg.text}`);
   });
   ```

Готово! Теперь Telegram работает как постоянный мессенджер с серверной интеграцией.
