// Middleware для проверки авторизации
export function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: 'Требуется авторизация' });
}

export function optionalAuth(req, res, next) {
  // Middleware для опциональной авторизации
  // Позволяет получить информацию о пользователе если он авторизован
  next();
}

