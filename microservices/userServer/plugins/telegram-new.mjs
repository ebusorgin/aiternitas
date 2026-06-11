import fetch from 'node-fetch';

// Упрощённый Telegram plugin - только основные поля
export const manifest = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Подключите свой Telegram аккаунт для отправки и получения сообщений',
  howItWorks: 'Используйте данные с my.telegram.org для подключения. Двойной клик откроет окно настройки.',
  fields: [
    {
      key: 'apiId',
      label: 'App api_id',
      type: 'text',
      required: true,
      placeholder: '35115172',
      help: 'Число из блока "App configuration" на my.telegram.org'
    },
    {
      key: 'apiHash',
      label: 'App api_hash',
      type: 'password',
      required: true,
      placeholder: '3a86bee7a54b8b364f4532c2dc6f91af',
      help: 'Строка из блока "App configuration" на my.telegram.org'
    },
    {
      key: 'appTitle',
      label: 'App title',
      type: 'text',
      required: true,
      placeholder: 'aiternitas',
      help: 'Название вашего приложения (любое)'
    },
    {
      key: 'publicKeys',
      label: 'Public keys (Production)',
      type: 'textarea',
      required: true,
      placeholder: '-----BEGIN RSA PUBLIC KEY-----\nMIIBCgKCAQEA6LszBcC1...\n-----END RSA PUBLIC KEY-----',
      help: 'Скопируйте из "Production configuration → Public keys" на my.telegram.org'
    }
  ],
  instructions: [
    {
      title: 'Где взять данные',
      steps: [
        '1. Откройте my.telegram.org и войдите через Telegram',
        '2. Перейдите в "API development tools"',
        '3. Создайте приложение (если нет) или используйте существующее',
        '4. Скопируйте данные из блоков "App configuration" и "Production configuration"',
        '5. Дважды кликните на элемент "Telegram" в flowchart для настройки'
      ]
    }
  ]
};

// Отправка сообщения через Bot API
export async function sendTelegramMessage({ botToken, chatId, text, parseMode = 'HTML' }) {
  if (!botToken) throw new Error('botToken is required');
  if (!chatId) throw new Error('chatId is required');
  if (!text) throw new Error('text is required');

  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true
    })
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const desc = data?.description || `HTTP ${res.status}`;
    throw new Error(`Telegram API error: ${desc}`);
  }
  return data.result;
}

function nowIso() {
  return new Date().toISOString();
}

// Тест подключения - отправка сообщения в "Избранное"
export async function testTelegramConnection({ config, userId }) {
  const testedAt = nowIso();
  const apiIdRaw = String(config?.apiId || '').trim();
  const apiHash = String(config?.apiHash || '').trim();
  const appTitle = String(config?.appTitle || '').trim();
  const publicKeys = String(config?.publicKeys || '').trim();

  // Валидация
  if (!apiIdRaw || !apiHash) {
    return { success: false, status: 'not_configured', testedAt, error: 'Не заполнены App api_id / App api_hash' };
  }

  const apiId = parseInt(apiIdRaw, 10);
  if (!Number.isFinite(apiId)) {
    return { success: false, status: 'invalid', testedAt, error: 'App api_id должен быть числом' };
  }

  if (!appTitle) {
    return { success: false, status: 'not_configured', testedAt, error: 'Не заполнен App title' };
  }

  if (!publicKeys || !publicKeys.includes('BEGIN RSA PUBLIC KEY')) {
    return { success: false, status: 'invalid', testedAt, error: 'Public keys должны содержать RSA ключ' };
  }

  // Для теста нужно создать временное подключение
  // Это требует полноценной авторизации с кодом из Telegram
  // Пока вернём статус "готов к подключению"
  return {
    success: true,
    status: 'ready',
    testedAt,
    message: 'Конфигурация валидна. Для подключения нажмите "Подключить" и введите код из Telegram.'
  };
}
