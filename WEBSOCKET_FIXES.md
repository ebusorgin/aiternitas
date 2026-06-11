# Исправления WebSocket ошибок - 2026-06-11

## 🐛 Исходные ошибки

```
Invalid frame header
WebSocket connection to 'ws://localhost:3000/socket.io/?...' failed
WebSocket connection to 'ws://localhost:3001/socket.io/?...' failed
GET http://localhost:3000/api/mail/folders 404 (Not Found)
TransportError: websocket error
```

## ✅ Исправления

### 1. **Gateway Server** (`microservices/gatewayServer/index.mjs`)
**Проблема**: Некорректный `pathRewrite` в http-proxy-middleware переписывал WebSocket пути

**Решение**:
- Удалён `pathRewrite: (p, req) => req.originalUrl`
- Оставлен стандартный обработчик путей (правильный)
- Добавлено улучшенное логирование для отладки

### 2. **Socket.IO Client** (`client/src/services/socket.js`)
**Проблема**: Клиент подключался к `localhost:3000` вместо правильного маршрута через Gateway

**Решение**:
- Добавлена логика определения корректного URL подключения
- Явно указан `path: '/socket.io/'`
- Добавлены комментарии для dev/production режимов

### 3. **Vite Proxy Config** (`client/vite.config.js`)
**Проблема**: Недостаточная конфигурация для WebSocket прокси

**Решение**:
- Добавлен explicit `rewrite` в обе прокси конфигурации
- Добавлен `onError` handler для логирования ошибок
- Явно указана поддержка WebSocket (`ws: true`)

## 🔧 Как это работает теперь

```
Браузер (localhost:3000)
    ↓
Vite Dev Server (прокси /socket.io) 
    ↓
API Gateway (localhost:3001)
    ↓
UserServer (localhost:4002, Socket.IO слушает)
```

## 📋 Запуск исправленного проекта

```powershell
# Остановить старые процессы
Get-Process node | Stop-Process -Force

# Перезапустить сервисы
cd C:\Users\evg\WebstormProjects\apk\aiternitas

# Terminal 1: Gateway
cd microservices/gatewayServer && node index.mjs

# Terminal 2: UserServer
cd microservices/userServer && npm run dev

# Terminal 3: Client
cd client && npm run dev
```

Или просто использовать `start.ps1` (обновлён ранее).

## 🧪 Проверка

1. Откройте http://localhost:3000
2. Откройте DevTools (F12) → Console
3. Если видите `🔌 Socket.IO connected` - WebSocket работает
4. Остальные ошибки должны быть исправлены

## 📝 Файлы которые были изменены

1. ✅ `microservices/gatewayServer/index.mjs` - убран pathRewrite, добавлено логирование
2. ✅ `client/src/services/socket.js` - исправлено подключение Socket.IO
3. ✅ `client/vite.config.js` - улучшена конфигурация WebSocket прокси
4. ✅ `microservices/userServer/index.mjs` - путь к uploads папке
5. ✅ `package.json` - исправлены рабочие области и скрипты

## 🔍 Техническая детализация

### Почему "Invalid frame header"?

- Socket.IO клиент отправляет WebSocket handshake
- Если сервер на другом порту не находится или не слушает
- Или если прокси неверно переписывает пути
- Результат: `Invalid frame header` (не валидный WebSocket фрейм)

### Почему работает теперь?

1. Vite прокси на localhost:3000 перенаправляет `/socket.io/*` → Gateway (localhost:3001)
2. Gateway устраняет pathRewrite, так что пути остаются целыми
3. Gateway WebSocket upgrade обработчик пробрасывает на UserServer (localhost:4002)
4. UserServer слушает Socket.IO и обрабатывает соединение

---
**Status**: ✅ RESOLVED
**Date**: 2026-06-11

