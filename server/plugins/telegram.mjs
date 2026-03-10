import fetch from 'node-fetch';

// Telegram plugin
// Config is provided by the user through "Плагин" element properties.

export const manifest = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Подключает Telegram к проекту. Настройка хранится на сервере и наследуется вниз по иерархии: можно подключить Telegram на корне (для всего проекта) или на конкретном звене (департамент/узел) только для этой ветки.',
  howItWorks: 'Плагин сохраняет серверные параметры доступа к Telegram. Для уведомлений обычно достаточно бота (Bot API). Если нужно работать как аккаунт (через MTProto), используются api_id/api_hash и номер телефона (аутентификация выполняется на сервере).',
  fields: [
    {
      key: 'authMode',
      label: 'Способ подключения',
      type: 'select',
      required: true,
      default: 'account',
      options: [
        { value: 'account', label: 'Telegram аккаунт (серверно, MTProto)' },
        { value: 'bot', label: 'Telegram бот (Bot API)' }
      ],
      help: 'Выберите, что именно вы подключаете. Аккаунт нужен для более широких сценариев, бот чаще всего подходит для уведомлений.'
    },
    {
      key: 'apiId',
      label: 'API ID',
      type: 'text',
      required: true,
      placeholder: '123456',
      showIf: { key: 'authMode', equals: 'account' },
      help: 'Берется на my.telegram.org → API development tools → App configuration → API ID.'
    },
    {
      key: 'apiHash',
      label: 'API Hash',
      type: 'password',
      required: true,
      placeholder: '0123456789abcdef0123456789abcdef',
      showIf: { key: 'authMode', equals: 'account' },
      help: 'Берется на my.telegram.org → API development tools → App configuration → API Hash.'
    },
    {
      key: 'phoneNumber',
      label: 'Номер телефона аккаунта',
      type: 'text',
      required: true,
      placeholder: '+79991234567',
      showIf: { key: 'authMode', equals: 'account' },
      help: 'Номер в международном формате (с +). Это тот номер, на который зарегистрирован Telegram.'
    },
    {
      key: 'twoFactorPassword',
      label: 'Пароль 2FA (если включен)',
      type: 'password',
      required: false,
      placeholder: '••••••••',
      showIf: { key: 'authMode', equals: 'account' },
      help: 'Нужен только если в Telegram включена двухэтапная аутентификация. Рекомендуется в дальнейшем заменить на безопасную серверную сессию.'
    },
    {
      key: 'sessionString',
      label: 'Серверная сессия (Session String)',
      type: 'textarea',
      required: false,
      placeholder: 'AQG... (длинная строка)',
      showIf: { key: 'authMode', equals: 'account' },
      help: 'Если у вас уже есть Session String (например, сгенерированный админом), вставьте сюда. Это безопаснее, чем хранить пароль 2FA.'
    },
    {
      key: 'botToken',
      label: 'Токен бота',
      type: 'password',
      required: true,
      placeholder: '123456789:AA...',
      showIf: { key: 'authMode', equals: 'bot' },
      help: 'Создается через @BotFather в Telegram.'
    },
    {
      key: 'defaultChatId',
      label: 'ID чата/канала (по умолчанию)',
      type: 'text',
      required: false,
      placeholder: '-1001234567890',
      help: 'Опционально. Если заполнить, система сможет отправлять уведомления без выбора чата каждый раз.'
    }
  ],
  instructions: [
    {
      title: 'Главное',
      text: 'Telegram в Aiternitas работает серверно: вы один раз задаете параметры доступа в плагине, и далее Telegram доступен на любом нижнем уровне иерархии (плагин наследуется вниз). Если вам нужен отдельный Telegram для конкретного департамента, создайте второй плагин внутри нужного узла.',
    },
    {
      title: 'Вариант A: Telegram аккаунт (MTProto, серверно)',
      text: 'Этот вариант использует ваш Telegram-аккаунт. Нужны api_id/api_hash (ключи приложения) и номер телефона. Важно: на my.telegram.org номер телефона НЕ показывается, его нужно взять из Telegram (или просто ввести тот, на который зарегистрирован аккаунт). Для серверного теста и отправки в "Избранное" нужен Session String (его можно сгенерировать скриптом scripts/plugins/telegram/generate-session.mjs). Где взять ключи:',
      showIf: { key: 'authMode', equals: 'account' },
      steps: [
        '1) Откройте сайт my.telegram.org (это официальный сайт Telegram).',
        '2) Войдите: введите номер телефона и код подтверждения, который придет в Telegram.',
        '3) Перейдите в раздел: "API development tools".',
        '4) Создайте приложение (Create new application), если его еще нет: заполните App title и Short name (любой текст).',
        '5) После создания на странице появятся "API ID" и "API Hash" (как на вашем скрине в блоке App configuration): скопируйте их в поля плагина.',
        '6) Номер телефона возьмите из Telegram: Telegram → Настройки → (ваш аккаунт) → номер телефона. Введите его в поле "Номер телефона аккаунта" в формате +<код_страны><номер> (например +79991234567).',
        '7) Если в Telegram включена 2FA (пароль): заполните "Пароль 2FA". Если 2FA нет, оставьте пустым.',
        '8) Session String: сгенерируйте его на сервере командой "node scripts/plugins/telegram/generate-session.mjs" и вставьте в поле "Серверная сессия". Это предпочтительнее, чем хранить пароль 2FA.'
      ]
    },
    {
      title: 'Вариант B: Telegram бот (Bot API)',
      text: 'Это самый простой способ для уведомлений (бот пишет сообщения). Что делать:',
      showIf: { key: 'authMode', equals: 'bot' },
      steps: [
        '1) Откройте Telegram и найдите @BotFather.',
        '2) Отправьте команду /newbot и следуйте инструкциям.',
        '3) Скопируйте выданный токен и вставьте в поле "Токен бота".',
        '4) (Опционально) Добавьте бота в чат/канал, куда он будет писать.',
        '5) (Опционально) Узнайте ID чата/канала и заполните "ID чата/канала (по умолчанию)".'
      ]
    },
    {
      title: 'Как понять, что вводить',
      steps: [
        'API ID / API Hash: выдаются только на my.telegram.org в разделе API development tools.',
        'Номер телефона: это номер Telegram-аккаунта (my.telegram.org его не показывает). Посмотреть можно в Telegram → Настройки.',
        'Токен бота: выдаёт только @BotFather и он выглядит как 123456789:AA....',
        'ID чата/канала: обычно отрицательное число для каналов/супергрупп (пример: -100...).'
      ]
    },
    {
      title: 'Где размещать плагин в структуре',
      text: 'Плагин считается подключенным на уровне того элемента, внутри которого он создан. Такой Telegram доступен для всех элементов ниже по иерархии. Если создать плагин на корне, он будет доступен всему проекту.'
    }
  ]
};

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

function normalizeAuthMode(cfg) {
  return (cfg?.authMode === 'bot' || cfg?.authMode === 'account') ? cfg.authMode : 'account';
}

export async function testTelegramConnection({ config, userId }) {
  const mode = normalizeAuthMode(config);
  const testedAt = nowIso();

  if (mode === 'bot') {
    const botToken = String(config?.botToken || '').trim();
    if (!botToken) {
      return { success: false, status: 'not_configured', testedAt, mode, error: 'Не заполнен токен бота' };
    }

    // Validate token by calling getMe
    const meUrl = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`;
    const meRes = await fetch(meUrl);
    const me = await meRes.json().catch(() => null);
    if (!meRes.ok || !me?.ok) {
      const desc = me?.description || `HTTP ${meRes.status}`;
      return { success: false, status: 'invalid', testedAt, mode, error: `Telegram Bot API: ${desc}` };
    }

    // Bots can't send to "Saved Messages". We can send to a configured chatId if provided.
    const chatId = String(config?.defaultChatId || '').trim();
    if (!chatId) {
      return {
        success: false,
        status: 'not_configured',
        testedAt,
        mode,
        error: 'Для бота нужно указать "ID чата/канала (по умолчанию)", иначе нельзя отправить тестовое сообщение.'
      };
    }

    await sendTelegramMessage({
      botToken,
      chatId,
      text: `✅ Aiternitas: Telegram (бот) подключен и работает.\nuser_id=${userId || 'unknown'}\n${testedAt}`,
      parseMode: undefined
    });

    return {
      success: true,
      status: 'connected',
      testedAt,
      mode,
      details: { botUsername: me?.result?.username || null }
    };
  }

  // account mode (MTProto) requires an authorized sessionString
  const apiIdRaw = String(config?.apiId || '').trim();
  const apiHash = String(config?.apiHash || '').trim();
  const sessionStringRaw = String(config?.sessionString || '').trim();
  const sessionString = sessionStringRaw || undefined;

  if (!apiIdRaw || !apiHash) {
    return { success: false, status: 'not_configured', testedAt, mode, error: 'Не заполнены API ID / API Hash' };
  }
  const apiId = parseInt(apiIdRaw, 10);
  if (!Number.isFinite(apiId)) {
    return { success: false, status: 'invalid', testedAt, mode, error: 'API ID должен быть числом' };
  }
  if (!sessionString) {
    return {
      success: false,
      status: 'not_configured',
      testedAt,
      mode,
      error: 'Не заполнена "Серверная сессия (Session String)". Для серверного теста и отправки в "Избранное" требуется авторизованная сессия. Сгенерируйте её командой: node scripts/plugins/telegram/generate-session.mjs'
    };
  }

  // Lazy import to avoid loading MTProto libs unless needed.
  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions/index.js');

  let client;
  try {
    // StringSession constructor throws "Not a valid string" if sessionString is invalid
    client = new TelegramClient(
      new StringSession(sessionString),
      apiId,
      apiHash,
      { connectionRetries: 2 }
    );
  } catch (e) {
    if (e?.message?.includes('Not a valid string')) {
      return {
        success: false,
        status: 'invalid',
        testedAt,
        mode,
        error: 'Session String невалиден. Используйте скрипт scripts/plugins/telegram/generate-session.mjs для генерации валидной сессии.'
      };
    }
    throw e;
  }

  try {
    await client.connect();
    // If the session is not authorized, sendMessage will fail.
    await client.sendMessage('me', {
      message: `✅ Aiternitas: Telegram (аккаунт) подключен и работает.\nuser_id=${userId || 'unknown'}\n${testedAt}`
    });

    return { success: true, status: 'connected', testedAt, mode };
  } catch (e) {
    const msg = e?.message || String(e);
    return { success: false, status: 'connection_failed', testedAt, mode, error: msg };
  } finally {
    try { if (client) await client.disconnect(); } catch {}
  }
}
