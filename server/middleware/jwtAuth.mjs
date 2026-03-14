import jwt from 'jsonwebtoken';
import pool from '../db.mjs';

const JWT_TTL = 30 * 24 * 60 * 60; // 30 дней в секундах

function getSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || 'aiternitas-jwt-secret-change-me';
}

export function createToken(userId, ttlSeconds = JWT_TTL) {
  return jwt.sign(
    { sub: String(userId) },
    getSecret(),
    { expiresIn: ttlSeconds }
  );
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const t = token.startsWith('Bearer ') ? token.slice(7) : token;
  if (!t.trim()) return null;
  try {
    const payload = jwt.verify(t, getSecret());
    return payload?.sub ? String(payload.sub) : null;
  } catch {
    return null;
  }
}

/**
 * Middleware: проверяет Authorization: Bearer <jwt>, кладёт userId, userName, userEmail в req.
 */
export function requireJwt(req, res, next) {
  const auth = req.get('Authorization') || req.headers?.authorization || '';
  const userId = verifyToken(auth);
  if (!userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  req.userId = userId;
  // userName, userEmail загружаются при необходимости в роутах или можно добавить сюда
  next();
}

/**
 * Загружает user из БД и кладёт в req.user. Вызывать после requireJwt.
 */
export async function loadUser(req, res, next) {
  if (!req.userId) return next();
  try {
    const result = await pool.query(
      'SELECT id, name, email, avatar, email_verified FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length > 0) {
      req.user = result.rows[0];
      req.userName = req.user.name;
      req.userEmail = req.user.email;
    }
  } catch (e) {
    console.error('loadUser error:', e);
  }
  next();
}

/**
 * Объединённый middleware: JWT + загрузка user. Для роутов, где нужны req.userId, req.userName, req.userEmail.
 */
export function requireJwtAndLoadUser(req, res, next) {
  const auth = req.get('Authorization') || req.headers?.authorization || '';
  const userId = verifyToken(auth);
  if (!userId) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  req.userId = userId;
  pool.query(
    'SELECT id, name, email, avatar, email_verified FROM users WHERE id = $1',
    [userId]
  ).then(result => {
    if (result.rows.length > 0) {
      req.user = result.rows[0];
      req.userName = req.user.name;
      req.userEmail = req.user.email;
    }
    next();
  }).catch(e => {
    console.error('loadUser error:', e);
    next();
  });
}
