#!/usr/bin/env node
/**
 * Скрипт для запуска тестов авторизации
 * 
 * Использование:
 *   node run-auth-tests.mjs           # Запуск всех тестов
 *   node run-auth-tests.mjs --unit    # Только unit тесты
 *   node run-auth-tests.mjs --session # Только тесты сессий
 *   node run-auth-tests.mjs --help    # Помощь
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Использование: node run-auth-tests.mjs [опции]

Опции:
  --unit      Запустить только unit тесты middleware
  --routes    Запустить только тесты роутов
  --session   Запустить только тесты сессий
  --all       Запустить все тесты (по умолчанию)
  --help, -h  Показать эту справку

Примеры:
  node run-auth-tests.mjs
  node run-auth-tests.mjs --unit
  node run-auth-tests.mjs --session
`);
  process.exit(0);
}

const tests = [];

if (args.includes('--unit')) {
  tests.push('backend/auth-middleware.test.mjs');
} else if (args.includes('--routes')) {
  tests.push('backend/auth-routes.test.mjs');
} else if (args.includes('--session')) {
  tests.push('backend/auth-session.test.mjs');
} else {
  // По умолчанию - все тесты
  tests.push(
    'backend/auth-middleware.test.mjs',
    'backend/auth-routes.test.mjs',
    'backend/auth-session.test.mjs'
  );
}

console.log('🧪 Запуск тестов авторизации...\n');

for (const test of tests) {
  console.log(`\n📋 ${test}`);
  console.log('='.repeat(50));
  
  try {
    execSync(`npx vitest run ${join(__dirname, test)}`, {
      stdio: 'inherit',
      cwd: join(__dirname, '..')
    });
  } catch (error) {
    console.error(`\n❌ Тесты ${test} завершились с ошибкой`);
    process.exit(1);
  }
}

console.log('\n✅ Все тесты пройдены!');
