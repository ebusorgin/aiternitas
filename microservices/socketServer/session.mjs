// Проверка HTTP-сессии для Socket.IO-соединений.
// Гейт умеет только: распарсить cookie, достать сессию из PostgreSQL,
// проверить пользователя. Никакой бизнес-логики.

import pool from './db.mjs';

function parseSessionId(cookieHeader) {
  if (!cookieHeader) return null;

  const cookies = {};
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.trim().split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
    }
  });

  let sessionId = cookies['aiternitas.sid'];
  if (!sessionId) return null;

  try {
    sessionId = decodeURIComponent(sessionId);
  } catch (e) {}

  if (sessionId.startsWith('s:')) sessionId = sessionId.substring(2);
  if (sessionId.includes('.')) sessionId = sessionId.split('.')[0];

  return sessionId;
}

// -> { sid, userId, name, email } | null
export async function verifySession(socket) {
  const sessionId = parseSessionId(socket.request?.headers?.cookie);
  if (!sessionId) return null;

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email
         FROM session s
         JOIN users u ON u.id = (s.sess->>'userId')::int
        WHERE s.sid = $1 AND s.expire > NOW()`,
      [sessionId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return { sid: sessionId, userId: row.id, name: row.name, email: row.email };
  } catch (e) {
    // сессия без userId / битый JSON — считаем неавторизованной
    return null;
  }
}
