/**
 * API встроенной почты: ящик @aiternitas.ru, папки, список, просмотр, отправка, черновики.
 */
import express from 'express';
import rateLimit from 'express-rate-limit';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { sendUserEmail, logEmailToDatabase } from '../utils/email.mjs';
import { getClientIp } from '../utils/ip.mjs';

const router = express.Router();
const MAIL_DOMAIN = (process.env.MAIL_DOMAIN || 'aiternitas.ru').toLowerCase();
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Слишком много отправок. Подождите минуту.' }
});

// GET /api/mail/me — информация о ящике (mail_login, адрес, есть ли ящик)
router.get('/me', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const r = await pool.query(
      'SELECT id, name, email, mail_login FROM users WHERE id = $1',
      [userId]
    );
    if (r.rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    const u = r.rows[0];
    const mailLogin = u.mail_login?.trim() || null;
    const hasMailbox = !!mailLogin;
    const mailAddress = hasMailbox ? `${mailLogin}@${MAIL_DOMAIN}` : null;
    res.json({
      success: true,
      user_id: u.id,
      mail_login: mailLogin,
      mail_address: mailAddress,
      has_mailbox: hasMailbox,
      site_email: u.email
    });
  } catch (e) {
    console.error('GET /api/mail/me:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/mail/setup — создать ящик (задать mail_login один раз)
router.post('/setup', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { mail_login: login } = req.body;
    const mailLogin = (login || '').toString().trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!mailLogin || mailLogin.length < 2) {
      return res.status(400).json({ error: 'Логин должен быть не короче 2 символов и содержать только латиницу, цифры, точку, подчёркивание или дефис' });
    }
    const existing = await pool.query(
      'SELECT id FROM users WHERE mail_login = $1 AND id != $2',
      [mailLogin, userId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Этот логин уже занят' });
    }
    await pool.query(
      'UPDATE users SET mail_login = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [mailLogin, userId]
    );
    res.json({
      success: true,
      mail_login: mailLogin,
      mail_address: `${mailLogin}@${MAIL_DOMAIN}`
    });
  } catch (e) {
    console.error('POST /api/mail/setup:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/mail/folders — папки и счётчики
router.get('/folders', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const folders = [
      { id: 'inbox', name: 'Входящие', icon: 'inbox' },
      { id: 'sent', name: 'Отправленные', icon: 'send' },
      { id: 'drafts', name: 'Черновики', icon: 'edit' },
      { id: 'spam', name: 'Спам', icon: 'alert' },
      { id: 'trash', name: 'Корзина', icon: 'trash' }
    ];
    const counts = await pool.query(
      `SELECT folder, COUNT(*) AS cnt FROM emails WHERE user_id = $1 GROUP BY folder`,
      [userId]
    );
    const byFolder = {};
    counts.rows.forEach((r) => { byFolder[r.folder] = parseInt(r.cnt, 10); });
    const unread = await pool.query(
      `SELECT folder, COUNT(*) AS cnt FROM emails WHERE user_id = $1 AND read_at IS NULL AND folder NOT IN ('sent','drafts') GROUP BY folder`,
      [userId]
    );
    const unreadByFolder = {};
    unread.rows.forEach((r) => { unreadByFolder[r.folder] = parseInt(r.cnt, 10); });
    const result = folders.map((f) => ({
      ...f,
      count: byFolder[f.id] || 0,
      unread: unreadByFolder[f.id] || 0
    }));
    res.json({ success: true, folders: result });
  } catch (e) {
    console.error('GET /api/mail/folders:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/mail/messages?folder=inbox&page=1&limit=20
router.get('/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const folder = (req.query.folder || 'inbox').toString().toLowerCase();
    const allowed = ['inbox', 'sent', 'drafts', 'spam', 'trash'];
    if (!allowed.includes(folder)) {
      return res.status(400).json({ error: 'Недопустимая папка' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const result = await pool.query(
      `SELECT id, sender, recipient, subject,
              LEFT(TRIM(REGEXP_REPLACE(COALESCE(body,''), '<[^>]+>', ' ', 'g')), 300) AS body_preview,
              direction, folder, read_at, created_at
       FROM emails
       WHERE user_id = $1 AND folder = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [userId, folder, limit, offset]
    );
    const countResult = await pool.query(
      'SELECT COUNT(*) AS total FROM emails WHERE user_id = $1 AND folder = $2',
      [userId, folder]
    );
    res.json({
      success: true,
      folder,
      messages: result.rows,
      total: parseInt(countResult.rows[0].total, 10)
    });
  } catch (e) {
    console.error('GET /api/mail/messages:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/mail/messages/:id
router.get('/messages/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Неверный id' });
    }
    const r = await pool.query(
      'SELECT id, sender, recipient, subject, body, headers, direction, folder, read_at, created_at FROM emails WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }
    const msg = r.rows[0];
    if (!msg.read_at) {
      await pool.query('UPDATE emails SET read_at = NOW() WHERE id = $1', [id]);
      msg.read_at = new Date();
    }
    res.json({ success: true, message: msg });
  } catch (e) {
    console.error('GET /api/mail/messages/:id:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PUT /api/mail/messages/:id — отметить прочитанным, переместить в папку
router.put('/messages/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Неверный id' });
    }
    const { read_at, folder } = req.body;
    const updates = [];
    const values = [];
    let v = 1;
    if (read_at !== undefined) {
      updates.push(`read_at = $${v++}`);
      values.push(read_at ? new Date(read_at) : null);
    }
    if (folder !== undefined) {
      const allowed = ['inbox', 'sent', 'drafts', 'spam', 'trash'];
      if (!allowed.includes(folder)) {
        return res.status(400).json({ error: 'Недопустимая папка' });
      }
      updates.push(`folder = $${v++}`);
      values.push(folder);
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'Укажите read_at или folder' });
    }
    values.push(id, userId);
    const r = await pool.query(
      `UPDATE emails SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${v++} AND user_id = $${v} RETURNING id`,
      values
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('PUT /api/mail/messages/:id:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/mail/send — отправить письмо (To, CC, BCC, subject, body)
router.post('/send', requireAuth, sendLimiter, async (req, res) => {
  try {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const userName = req.session.userName || 'Пользователь';
    const { to, cc, bcc, subject, body } = req.body;
    const toEmail = (to || '').toString().trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@')) {
      return res.status(400).json({ error: 'Укажите корректный email получателя (Кому)' });
    }
    const clientIp = getClientIp(req);
    const userRow = await pool.query('SELECT mail_login FROM users WHERE id = $1', [userId]);
    const mailLogin = userRow.rows[0]?.mail_login;
    const from = mailLogin ? `${mailLogin}@${MAIL_DOMAIN}` : (userEmail || null);
    if (!from) {
      return res.status(400).json({ error: 'Сначала создайте почтовый ящик (логин) в разделе «Почта»' });
    }
    const result = await sendUserEmail(from, userName, toEmail, subject || '', body || '', userId, clientIp);
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Не удалось отправить письмо' });
    }
    // Не дублируем во «Входящие» — письма туда попадают только через receiver (MX → Postfix → порт 2525),
    // когда кто‑то отправляет на user@aiternitas.ru. Внешние адреса (Gmail и т.п.) — только у получателя.
    res.json({ success: true, message: 'Письмо отправлено' });
  } catch (e) {
    console.error('POST /api/mail/send:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/mail/drafts — сохранить черновик
router.post('/drafts', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const userEmail = req.session.userEmail;
    const r = await pool.query('SELECT mail_login FROM users WHERE id = $1', [userId]);
    const from = userEmail || (r.rows[0]?.mail_login ? `${r.rows[0].mail_login}@${MAIL_DOMAIN}` : 'draft@local');
    const { to, subject, body } = req.body;
    await pool.query(
      `INSERT INTO emails (sender, recipient, subject, body, direction, folder, status, user_id, sent_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, 'outgoing', 'drafts', 'draft', $5, $5, NOW())`,
      [from, (to || '').trim(), subject || '', body || '', userId]
    );
    res.json({ success: true, message: 'Черновик сохранён' });
  } catch (e) {
    console.error('POST /api/mail/drafts:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/mail/messages/:id — в корзину или окончательно (query: permanent=1)
router.delete('/messages/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const id = parseInt(req.params.id, 10);
    const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'Неверный id' });
    }
    if (permanent) {
      const r = await pool.query('DELETE FROM emails WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Письмо не найдено' });
      }
      return res.json({ success: true, message: 'Письмо удалено' });
    }
    const r = await pool.query(
      "UPDATE emails SET folder = 'trash', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, userId]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: 'Письмо не найдено' });
    }
    res.json({ success: true, message: 'Письмо перемещено в корзину' });
  } catch (e) {
    console.error('DELETE /api/mail/messages/:id:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
