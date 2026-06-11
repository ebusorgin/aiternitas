import express from 'express';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedEmail } from '../utils/email.mjs';
import { getClientIp } from '../utils/ip.mjs';
import { getBaseUrl } from '../utils/url.mjs';

const router = express.Router();

// Rate limiting: login и register — до 10 попыток за 15 минут с одного IP
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting: resend-verification — до 5 запросов в час с одного IP
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много запросов на повторную отправку. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting: forgot-password — до 5 запросов в час с одного IP
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting: reset-password — до 10 попыток за 15 минут с одного IP
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Генерация токена для верификации email
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Инициализация Google OAuth клиента
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl()}/api/auth/google/callback`
);

// Регистрация
router.post('/register', authRateLimiter, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 8 символов' });
    }

    // Проверка существующего пользователя
    const existingUser = await pool.query(
      'SELECT id, google_id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      if (existingUser.rows[0].google_id) {
        return res.status(400).json({ error: 'Пользователь с таким email уже зарегистрирован через Google. Используйте вход через Google.' });
      }
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    // Генерация токена для верификации email
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа

    // Создание пользователя (email не подтвержден)
    const result = await pool.query(
      `INSERT INTO users (name, email, password, email_verified, email_verification_token, email_verification_expires) 
       VALUES ($1, $2, $3, false, $4, $5) 
       RETURNING id, name, email, avatar, email_verified, created_at`,
      [name, email.toLowerCase(), hashedPassword, verificationToken, verificationExpires]
    );

    const user = result.rows[0];

    // Отправка email с ссылкой для подтверждения
    const clientIp = getClientIp(req);
    console.log(`📧 Отправка письма для верификации email пользователю ${user.email}...`);
    const emailResult = await sendVerificationEmail(user.email, user.name, verificationToken, clientIp, user.id);
    if (!emailResult.success) {
      console.error(`❌ Не удалось отправить письмо: ${emailResult.error}`);
      // Продолжаем регистрацию; в ответе помечаем, что письмо не ушло — пользователь может запросить повторно
    }

    // Автоматический вход после регистрации (но email не подтвержден)
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    
    // Сохраняем сессию перед отправкой ответа
    req.session.save((err) => {
      if (err) {
        console.error('Ошибка сохранения сессии:', err);
        return res.status(500).json({ error: 'Ошибка создания сессии' });
      }
      
      res.status(201).json({
        success: true,
        message: emailResult.success
          ? 'Регистрация успешна. Пожалуйста, проверьте вашу почту и подтвердите email.'
          : 'Регистрация успешна, но письмо с подтверждением не удалось отправить. Используйте «Отправить письмо повторно» в профиле или обратитесь к администратору.',
        emailVerificationRequired: true,
        emailSendFailed: !emailResult.success,
        emailSendError: !emailResult.success ? (emailResult.error || 'Неизвестная ошибка') : undefined,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          email_verified: user.email_verified
        }
      });
    });
  } catch (error) {
    console.error('Ошибка регистрации:', error);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

// Авторизация
router.post('/login', authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email и пароль обязательны' });
    }

    // Поиск пользователя
    const result = await pool.query(
      'SELECT id, name, email, password, avatar, google_id, email_verified, email_verification_token, email_verification_expires FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const user = result.rows[0];

    // Проверяем, есть ли пароль у пользователя
    if (!user.password) {
      return res.status(401).json({ error: 'Этот аккаунт зарегистрирован через Google. Используйте вход через Google.' });
    }

    // Проверка пароля
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    // Проверка верификации email (только для пользователей с паролем, не через Google)
    if (!user.google_id && !user.email_verified) {
      // Генерируем новый токен если старый истек
      let verificationToken = user.email_verification_token;
      let verificationExpires = user.email_verification_expires;
      
      if (!verificationToken || !verificationExpires || new Date(verificationExpires) < new Date()) {
        verificationToken = generateVerificationToken();
        verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        await pool.query(
          'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
          [verificationToken, verificationExpires, user.id]
        );
      }
      
      // Отправляем новое письмо с токеном
      const clientIp = getClientIp(req);
      console.log(`📧 Отправка письма для верификации email пользователю ${user.email}...`);
      const emailResult = await sendVerificationEmail(user.email, user.name, verificationToken, clientIp, user.id);
      if (!emailResult.success) {
        console.error(`❌ Не удалось отправить письмо: ${emailResult.error}`);
      }
      
      return res.status(403).json({ 
        error: 'Email не подтвержден. Пожалуйста, проверьте вашу почту и подтвердите email. Если письмо не пришло, используйте функцию повторной отправки.',
        emailVerificationRequired: true
      });
    }

    // Создание сессии
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;
    
    console.log(`✅ Пользователь вошел через HTTP: ${user.email} (id: ${user.id})`);

    // Сохраняем сессию перед отправкой ответа
    req.session.save((err) => {
      if (err) {
        console.error('Ошибка сохранения сессии:', err);
        return res.status(500).json({ error: 'Ошибка создания сессии' });
      }
      
      res.json({
        success: true,
        message: 'Вход выполнен успешно',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          email_verified: user.email_verified
        }
      });
    });
  } catch (error) {
    console.error('Ошибка авторизации:', error);
    res.status(500).json({ error: 'Ошибка сервера при авторизации' });
  }
});

// Выход
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка при выходе' });
    }
    res.json({ success: true, message: 'Выход выполнен' });
  });
});

// Запрос сброса пароля (всегда один и тот же ответ, чтобы не раскрывать наличие email)
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Укажите email' });
    }
    const normalizedEmail = email.toLowerCase().trim();
    const result = await pool.query(
      'SELECT id, name, email, password FROM users WHERE email = $1',
      [normalizedEmail]
    );
    if (result.rows.length > 0) {
      const user = result.rows[0];
      if (user.password) {
        const resetToken = generateVerificationToken();
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 час
        await pool.query(
          'UPDATE users SET password_reset_token = $1, password_reset_expires = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [resetToken, resetExpires, user.id]
        );
        const clientIp = getClientIp(req);
        await sendPasswordResetEmail(user.email, user.name, resetToken, clientIp);
      }
    }
    res.json({
      success: true,
      message: 'Если указанный email зарегистрирован, на него отправлена ссылка для сброса пароля.'
    });
  } catch (error) {
    console.error('Ошибка forgot-password:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Проверка токена сброса пароля (без изменения состояния). Для UX: показать форму только при valid.
router.get('/reset-password/validate', async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      return res.json({ valid: false, reason: 'invalid' });
    }
    const result = await pool.query(
      'SELECT password_reset_expires FROM users WHERE password_reset_token = $1',
      [token.trim()]
    );
    if (result.rows.length === 0) {
      return res.json({ valid: false, reason: 'invalid' });
    }
    if (new Date(result.rows[0].password_reset_expires) < new Date()) {
      return res.json({ valid: false, reason: 'expired' });
    }
    res.json({ valid: true });
  } catch (error) {
    console.error('Ошибка reset-password/validate:', error);
    res.status(500).json({ valid: false, reason: 'invalid' });
  }
});

// Сброс пароля по токену из письма. На почту уходит уведомление о смене пароля.
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Укажите токен и новый пароль' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 8 символов' });
    }
    const result = await pool.query(
      'SELECT id, name, email, password_reset_expires FROM users WHERE password_reset_token = $1',
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Недействительный или устаревший токен' });
    }
    const user = result.rows[0];
    if (new Date(user.password_reset_expires) < new Date()) {
      return res.status(400).json({ error: 'Срок действия ссылки истёк. Запросите сброс пароля снова.' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, password_reset_token = NULL, password_reset_expires = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, user.id]
    );

    const clientIp = getClientIp(req);
    console.log(`📧 Отправка уведомления о смене пароля (сброс) на ${user.email}...`);
    const emailResult = await sendPasswordChangedEmail(user.email, user.name || 'Пользователь', clientIp);
    if (!emailResult.success) {
      console.error(`❌ Не удалось отправить уведомление: ${emailResult.error}`);
    }

    res.json({ success: true, message: 'Пароль успешно изменён. Войдите с новым паролем. На вашу почту отправлено уведомление.' });
  } catch (error) {
    console.error('Ошибка reset-password:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение текущего пользователя (по cookie сессии)
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Требуется авторизация', success: false });
  }
  try {
    const result = await pool.query(
      'SELECT id, name, email, avatar, email_verified, created_at FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (result.rows.length === 0) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Пользователь не найден', success: false });
    }
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Ошибка /api/auth/me:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
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
      return res.redirect(`${getBaseUrl()}/?error=google_auth_failed`);
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
      
      // Обновляем аватар если его нет или если Google предоставил новый
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
        // Пользователь существует с таким email - связываем Google ID и подтверждаем email
        user = emailResult.rows[0];
        await pool.query(
          'UPDATE users SET google_id = $1, avatar = COALESCE(avatar, $2), email_verified = true, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [googleId, picture, user.id]
        );
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
      } else {
        // Создаем нового пользователя (email автоматически подтвержден через Google)
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
    
    // Сохраняем сессию перед редиректом
    req.session.save((err) => {
      if (err) {
        console.error('Ошибка сохранения сессии:', err);
        return res.redirect(`${getBaseUrl()}/?error=session_failed`);
      }
      
      // Перенаправляем на главную страницу
      res.redirect(`${getBaseUrl()}/`);
    });
  } catch (error) {
    console.error('Ошибка Google OAuth:', error);
    res.redirect(`${getBaseUrl()}/?error=google_auth_failed`);
  }
});

// Google OAuth - проверка токена (для фронтенда)
router.post('/google/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Токен не предоставлен' });
    }

    // Верифицируем токен
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const picture = payload.picture;

    // Проверяем, существует ли пользователь
    let userResult = await pool.query(
      'SELECT id, name, email, avatar FROM users WHERE google_id = $1',
      [googleId]
    );

    let user;

    if (userResult.rows.length > 0) {
      user = userResult.rows[0];
      if (picture && (!user.avatar || user.avatar.startsWith('http'))) {
        await pool.query(
          'UPDATE users SET avatar = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [picture, user.id]
        );
        user.avatar = picture;
      }
    } else {
      const emailResult = await pool.query(
        'SELECT id, name, email, avatar FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (emailResult.rows.length > 0) {
        // Пользователь существует с таким email - связываем Google ID и подтверждаем email
        user = emailResult.rows[0];
        await pool.query(
          'UPDATE users SET google_id = $1, avatar = COALESCE(avatar, $2), email_verified = true, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [googleId, picture, user.id]
        );
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
      } else {
        // Создаем нового пользователя (email автоматически подтвержден через Google)
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
    
    // Сохраняем сессию перед отправкой ответа
    req.session.save((err) => {
      if (err) {
        console.error('Ошибка сохранения сессии:', err);
        return res.status(500).json({ error: 'Ошибка создания сессии' });
      }
      
      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar
        }
      });
    });
  } catch (error) {
    console.error('Ошибка верификации Google токена:', error);
    res.status(500).json({ error: 'Ошибка верификации токена' });
  }
});

// Верификация email
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect(`${getBaseUrl()}/?error=invalid_token`);
    }

    // Поиск пользователя по токену
    const result = await pool.query(
      'SELECT id, email, email_verification_expires FROM users WHERE email_verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.redirect(`${getBaseUrl()}/?error=invalid_token`);
    }

    const user = result.rows[0];

    // Проверка срока действия токена
    if (new Date(user.email_verification_expires) < new Date()) {
      return res.redirect(`${getBaseUrl()}/?error=token_expired`);
    }

    // Подтверждаем email
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
      res.redirect(`${getBaseUrl()}/?email_verified=true`);
    });
  } catch (error) {
    console.error('Ошибка верификации email:', error);
    res.redirect(`${getBaseUrl()}/?error=verification_failed`);
  }
});

// Повторная отправка письма для верификации
router.post('/resend-verification', resendVerificationLimiter, requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    const userResult = await pool.query(
      'SELECT id, name, email, email_verified, email_verification_token, email_verification_expires FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    const user = userResult.rows[0];

    if (user.email_verified) {
      return res.status(400).json({ error: 'Email уже подтвержден' });
    }

    // Генерируем новый токен
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET email_verification_token = $1, email_verification_expires = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [verificationToken, verificationExpires, userId]
    );

    // Отправка email
    const clientIp = getClientIp(req);
    console.log(`📧 Отправка письма для верификации email пользователю ${user.email}...`);
    try {
      const emailResult = await sendVerificationEmail(user.email, user.name || 'Пользователь', verificationToken, clientIp, userId);
      
      if (emailResult.success) {
        res.json({
          success: true,
          message: 'Письмо для подтверждения email отправлено на ваш адрес'
        });
      } else {
        console.error(`❌ Не удалось отправить письмо: ${emailResult.error}`);
        res.status(500).json({ 
          error: 'Не удалось отправить письмо. Попробуйте позже.'
        });
      }
    } catch (error) {
      console.error('Ошибка при отправке email:', error);
      res.status(500).json({ 
        error: 'Ошибка сервера при отправке письма'
      });
    }
  } catch (error) {
    console.error('Ошибка повторной отправки письма:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновление имени пользователя
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

// Смена пароля (для пользователей с паролем, не только Google). На почту уходит уведомление.
router.put('/profile/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Новый пароль должен быть не менее 8 символов' });
    }
    const result = await pool.query(
      'SELECT id, name, email, password FROM users WHERE id = $1',
      [req.session.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const user = result.rows[0];
    if (!user.password) {
      return res.status(400).json({ error: 'У этого аккаунта нет пароля (вход через Google). Задайте пароль через «Забыли пароль?» после выхода.' });
    }
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Неверный текущий пароль' });
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedPassword, req.session.userId]
    );

    const clientIp = getClientIp(req);
    console.log(`📧 Отправка уведомления о смене пароля на ${user.email}...`);
    const emailResult = await sendPasswordChangedEmail(user.email, user.name || 'Пользователь', clientIp);
    if (!emailResult.success) {
      console.error(`❌ Не удалось отправить уведомление о смене пароля: ${emailResult.error}`);
    }

    res.json({ success: true, message: 'Пароль успешно изменён. На вашу почту отправлено уведомление.' });
  } catch (error) {
    console.error('Ошибка смены пароля:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Тестовый endpoint для проверки отправки email (только для разработки; в production отключен)
router.post('/test-email', requireAuth, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { email } = req.body;
    const testEmail = email || req.session.userEmail;
    
    if (!testEmail) {
      return res.status(400).json({ error: 'Email не указан' });
    }
    
    const testToken = generateVerificationToken();
    const clientIp = getClientIp(req);
    console.log('🧪 Тестовая отправка email...');
    const result = await sendVerificationEmail(testEmail, 'Test User', testToken, clientIp, req.session.userId);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Тестовое письмо отправлено на ${testEmail}`,
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: 'Не удалось отправить тестовое письмо. Проверьте настройки SMTP и логи сервера.'
      });
    }
  } catch (error) {
    console.error('Ошибка тестовой отправки email:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;

