#!/usr/bin/env node
// Генерация случайного SESSION_SECRET для production.
// Запуск: node scripts/generate-session-secret.mjs

import crypto from 'crypto';

const secret = crypto.randomBytes(32).toString('hex');
console.log('Скопируйте эту строку в .env.production или в systemd как SESSION_SECRET:\n');
console.log(secret);
console.log('\nИли одной строкой для .env:');
console.log(`SESSION_SECRET=${secret}`);
