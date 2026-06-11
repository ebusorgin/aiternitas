// Утилита для получения IP адреса клиента из Express request

/**
 * Получает IP адрес клиента из Express request
 * Учитывает прокси (nginx) через заголовки X-Real-IP и X-Forwarded-For
 */
export function getClientIp(req) {
  // Проверяем заголовки от прокси
  const xRealIp = req.headers['x-real-ip'];
  const xForwardedFor = req.headers['x-forwarded-for'];
  
  // X-Real-IP имеет приоритет (устанавливается nginx)
  if (xRealIp) {
    // Может быть массив, берем первый элемент
    return Array.isArray(xRealIp) ? xRealIp[0] : xRealIp.split(',')[0].trim();
  }
  
  // X-Forwarded-For может содержать список IP через запятую
  if (xForwardedFor) {
    // Берем первый IP (оригинальный клиент)
    const ip = xForwardedFor.split(',')[0].trim();
    return ip;
  }
  
  // Используем встроенный метод Express (работает с trust proxy)
  if (req.ip) {
    return req.ip;
  }
  
  // Fallback на connection remoteAddress
  if (req.connection && req.connection.remoteAddress) {
    return req.connection.remoteAddress;
  }
  
  if (req.socket && req.socket.remoteAddress) {
    return req.socket.remoteAddress;
  }
  
  return null;
}

