/**
 * API писем: входящие и исходящие для текущего пользователя, отправка писем.
 */
import express from 'express';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { sendUserEmail, logEmailToDatabase } from '../utils/email.mjs';
import { getClientIp } from '../utils/ip.mjs';

const router = express.Router();
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Отправка письма (написать письмо). Если получатель — пользователь приложения, письмо также попадает во «Входящие».
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { to, subject, body } = req.body;
    const toEmail = (to || '').toString().trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ error: 'Укажите корректный email получателя' });
    }
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const userName = req.session.userName || 'Пользователь';
    const clientIp = getClientIp(req);

    const result = await sendUserEmail(userEmail, userName, toEmail, subject || '', body || '', userId, clientIp);

    // «Внутренняя доставка»: если получатель — пользователь приложения, письмо попадает во «Входящие» (даже без SMTP)
    const recipientUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [toEmail]);
    if (recipientUser.rows.length > 0) {
      await logEmailToDatabase({
        sender: userEmail || 'unknown',
        recipient: toEmail,
        subject: subject || '(без темы)',
        body: (body || '').substring(0, 50000),
        headers: '',
        size: Buffer.byteLength(body || '', 'utf8'),
        clientIp: null,
        direction: 'incoming',
        status: 'delivered',
        sentByUserId: null
      });
    }

    const internalDelivered = recipientUser.rows.length > 0;
    if (!result.success && !internalDelivered) {
      return res.status(500).json({ error: result.error || 'Не удалось отправить письмо' });
    }
    res.json({
      success: true,
      message: result.success
        ? 'Письмо отправлено'
        : 'Письмо сохранено в «Исходящие» и доставлено во «Входящие» в приложении (отправка по SMTP не выполнена).'
    });
  } catch (error) {
    console.error('Ошибка POST /api/emails/send:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Входящие (recipient = email пользователя)
router.get('/inbox', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const userEmail = req.session.userEmail?.toLowerCase();
    if (!userEmail) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const result = await pool.query(
      `SELECT id, sender, recipient, subject, LEFT(body, 500) AS body_preview, direction, status, created_at
       FROM emails
       WHERE direction = 'incoming' AND LOWER(recipient) = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userEmail, limit, offset]
    );
    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM emails WHERE direction = $1 AND LOWER(recipient) = $2',
      ['incoming', userEmail]
    );
    res.json({
      success: true,
      emails: result.rows,
      total: parseInt(countResult.rows[0].total, 10)
    });
  } catch (error) {
    console.error('Ошибка GET /api/emails/inbox:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Исходящие (sent_by_user_id = текущий пользователь)
router.get('/sent', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Требуется авторизация' });
    }
    const result = await pool.query(
      `SELECT id, sender, recipient, subject, LEFT(body, 500) AS body_preview, direction, status, created_at
       FROM emails
       WHERE direction = 'outgoing' AND sent_by_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM emails WHERE direction = $1 AND sent_by_user_id = $2',
      ['outgoing', userId]
    );
    res.json({
      success: true,
      emails: result.rows,
      total: parseInt(countResult.rows[0].total, 10)
    });
  } catch (error) {
    console.error('Ошибка GET /api/emails/sent:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Одно письмо по id (доступ только своё: inbox — recipient = user.email, sent — sent_by_user_id = user.id)
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Неверный id' });
    }
    const userEmail = req.session.userEmail?.toLowerCase();
    const userId = req.session.userId;
    const row = await pool.query(
      'SELECT id, sender, recipient, subject, body, direction, status, sent_by_user_id, created_at FROM emails WHERE id = $1',
      [id]
    );
    if (row.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }
    const email = row.rows[0];
    const isInbox = email.direction === 'incoming' && userEmail && email.recipient?.toLowerCase() === userEmail;
    const isSent = email.direction === 'outgoing' && email.sent_by_user_id === userId;
    if (!isInbox && !isSent) {
      return res.status(403).json({ error: 'Нет доступа к этому письму' });
    }
    res.json({ success: true, email: email });
  } catch (error) {
    console.error('Ошибка GET /api/emails/:id:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
