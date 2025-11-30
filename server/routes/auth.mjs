import express from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { sendVerificationEmail } from '../utils/email.mjs';
import { getClientIp } from '../utils/ip.mjs';

const router = express.Router();

// Генерация токена для верификации email
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Инициализация Google OAuth клиента
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL || 'http://localhost:3001'}/api/auth/google/callback`
);

// ============================================
// NOTE: Register, Login, Logout are now handled via Socket.IO
// See: server/socket/auth.mjs
// HTTP routes below are kept for Google OAuth only (requires redirects)
// ============================================

// Получение текущего пользователя (for initial page load / Google OAuth callback)
router.get('/me', (req, res) => {
  // Проверяем сессию
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ 
      error: 'Требуется авторизация',
      success: false 
    });
  }

  (async () => {
    try {
      const result = await pool.query(
        'SELECT id, name, email, avatar, email_verified, created_at FROM users WHERE id = $1',
        [req.session.userId]
      );

      if (result.rows.length === 0) {
        req.session.destroy();
        return res.status(401).json({ 
          error: 'Пользователь не найден',
          success: false 
        });
      }

      res.json({
        success: true,
        user: result.rows[0]
      });
    } catch (error) {
      console.error('Ошибка получения пользователя:', error);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  })();
});

// Google OAuth - получение URL для авторизации
router.get('/google', (req, res) => {
  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account'
  });
  res.json({ authUrl });
});

// Google OAuth - обработка callback
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=google_auth_failed`);
    }

    // Обмениваем код на токен
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    // Получаем информацию о пользователе
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    // Проверяем, существует ли пользователь с таким Google ID
    let userResult = await pool.query(
      'SELECT id, name, email, avatar FROM users WHERE google_id = $1',
      [googleId]
    );

    let user;

    if (userResult.rows.length > 0) {
      // Пользователь существует - обновляем информацию
      user = userResult.rows[0];
      
      if (picture && (!user.avatar || user.avatar.startsWith('http'))) {
        await pool.query(
          'UPDATE users SET avatar = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [picture, user.id]
        );
        user.avatar = picture;
      }
    } else {
      // Проверяем, есть ли пользователь с таким email
      const emailResult = await pool.query(
        'SELECT id, name, email, avatar FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (emailResult.rows.length > 0) {
        // Связываем Google ID и подтверждаем email
        user = emailResult.rows[0];
        await pool.query(
          'UPDATE users SET google_id = $1, avatar = COALESCE(avatar, $2), email_verified = true, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [googleId, picture, user.id]
        );
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
      } else {
        // Создаем нового пользователя
        const newUserResult = await pool.query(
          `INSERT INTO users (name, email, google_id, avatar, email_verified) 
           VALUES ($1, $2, $3, $4, true) 
           RETURNING id, name, email, avatar, created_at`,
          [name, email.toLowerCase(), googleId, picture]
        );
        user = newUserResult.rows[0];
      }
    }

    // Создаем сессию
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    
    req.session.save((err) => {
      if (err) {
        console.error('Ошибка сохранения сессии:', err);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=session_failed`);
      }
      
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/`);
    });
  } catch (error) {
    console.error('Ошибка Google OAuth:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=google_auth_failed`);
  }
});

// Верификация email (still needs HTTP for email link)
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=invalid_token`);
    }

    const result = await pool.query(
      'SELECT id, email, email_verification_expires FROM users WHERE email_verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=invalid_token`);
    }

    const user = result.rows[0];

    if (new Date(user.email_verification_expires) < new Date()) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=token_expired`);
    }

    await pool.query(
      'UPDATE users SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Автоматический вход после подтверждения
    req.session.userId = user.id;
    req.session.userName = (await pool.query('SELECT name FROM users WHERE id = $1', [user.id])).rows[0].name;
    req.session.userEmail = user.email;
    
    req.session.save((err) => {
      if (err) {
        console.error('Ошибка сохранения сессии:', err);
      }
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?email_verified=true`);
    });
  } catch (error) {
    console.error('Ошибка верификации email:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=verification_failed`);
  }
});

// Повторная отправка письма для верификации
router.post('/resend-verification', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const userResult = await pool.query(
      'SELECT id, name, email, email_verified FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email уже подтвержден' });
    }

    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET email_verification_token = $1, email_verification_expires = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [verificationToken, verificationExpires, userId]
    );

    const clientIp = getClientIp(req);
    const emailResult = await sendVerificationEmail(user.email, user.name || 'Пользователь', verificationToken, clientIp);
    
    if (emailResult.success) {
      res.json({
        success: true,
        message: 'Письмо для подтверждения email отправлено на ваш адрес'
      });
    } else {
      res.status(500).json({ 
        error: 'Не удалось отправить письмо. Попробуйте позже.'
      });
    }
  } catch (error) {
    console.error('Ошибка повторной отправки письма:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновление имени пользователя (still used by Profile page via HTTP)
router.put('/profile/name', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Имя не может быть пустым' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Имя слишком длинное (максимум 100 символов)' });
    }

    const result = await pool.query(
      `UPDATE users 
       SET name = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING id, name, email, avatar`,
      [name.trim(), req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    req.session.userName = result.rows[0].name;

    res.json({
      success: true,
      message: 'Имя обновлено',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка обновления имени:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
