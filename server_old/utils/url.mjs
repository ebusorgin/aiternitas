/**
 * Базовый URL фронтенда для ссылок в письмах и редиректов.
 * Приоритет: FRONTEND_URL → BASE_URL → https://aiternitas.ru (production).
 */
export function getBaseUrl() {
  if (process.env.FRONTEND_URL) return process.env.FRONTEND_URL.replace(/\/$/, '');
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return 'https://aiternitas.ru';
  return 'http://localhost:3001';
}
