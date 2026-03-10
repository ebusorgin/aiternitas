/**
 * Generate Telegram MTProto session string (GramJS) for server-side account auth.
 *
 * Usage:
 *   node scripts/plugins/telegram/generate-session.mjs
 *
 * It will ask for api_id, api_hash, phone number, code, and (if enabled) 2FA password,
 * then prints a Session String. Paste it into the Telegram plugin field "Серверная сессия (Session String)".
 */

import readline from 'readline';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

function ask(rl, q) {
  return new Promise((resolve) => rl.question(q, (a) => resolve(String(a || '').trim())));
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const apiIdRaw = await ask(rl, 'API ID (число): ');
    const apiHash = await ask(rl, 'API Hash: ');
    const phoneNumber = await ask(rl, 'Номер телефона (+7999...): ');

    const apiId = parseInt(apiIdRaw, 10);
    if (!Number.isFinite(apiId) || !apiHash || !phoneNumber) {
      throw new Error('Неверные входные данные');
    }

    const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });

    await client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => await ask(rl, 'Код из Telegram: '),
      password: async () => await ask(rl, 'Пароль 2FA (если есть, иначе Enter): '),
      onError: (err) => console.error('Auth error:', err?.message || err),
    });

    const sessionString = client.session.save();
    console.log('\n=== Session String ===\n');
    console.log(sessionString);
    console.log('\nСкопируйте и вставьте в плагин: "Серверная сессия (Session String)".\n');

    await client.disconnect();
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error('Failed:', e?.message || e);
  process.exit(1);
});

