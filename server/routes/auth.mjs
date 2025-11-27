import express from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';
import { sendVerificationEmail } from '../utils/email.mjs';

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

// Регистрация
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Все поля обязательны' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
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
    console.log(`📧 Отправка письма для верификации email пользователю ${user.email}...`);
    const emailResult = await sendVerificationEmail(user.email, user.name, verificationToken);
    if (!emailResult.success) {
      console.error(`❌ Не удалось отправить письмо: ${emailResult.error}`);
      // Продолжаем регистрацию даже если email не отправился
      // Пользователь может запросить новое письмо позже
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
        message: 'Регистрация успешна. Пожалуйста, проверьте вашу почту и подтвердите email.',
        emailVerificationRequired: true,
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
router.post('/login', async (req, res) => {
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
      console.log(`📧 Отправка письма для верификации email пользователю ${user.email}...`);
      const emailResult = await sendVerificationEmail(user.email, user.name, verificationToken);
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

// Получение текущего пользователя
router.get('/me', (req, res) => {
  // Логируем информацию о сессии для отладки
  console.log('Session check:', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    sessionId: req.sessionID,
    cookies: req.headers.cookie
  });
  
  // Проверяем сессию без middleware для более детальной обработки
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
        // Если пользователь не найден, очищаем сессию
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
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=session_failed`);
      }
      
      // Перенаправляем на главную страницу
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/`);
    });
  } catch (error) {
    console.error('Ошибка Google OAuth:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=google_auth_failed`);
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
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=invalid_token`);
    }

    // Поиск пользователя по токену
    const result = await pool.query(
      'SELECT id, email, email_verification_expires FROM users WHERE email_verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=invalid_token`);
    }

    const user = result.rows[0];

    // Проверка срока действия токена
    if (new Date(user.email_verification_expires) < new Date()) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/?error=token_expired`);
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
    console.log(`📧 Отправка письма для верификации email пользователю ${user.email}...`);
    try {
      const emailResult = await sendVerificationEmail(user.email, user.name || 'Пользователь', verificationToken);
      
      if (emailResult.success) {
        res.json({
          success: true,
          message: 'Письмо для подтверждения email отправлено на ваш адрес'
        });
      } else {
        console.error(`❌ Не удалось отправить письмо: ${emailResult.error}`);
        res.status(500).json({ 
          error: 'Не удалось отправить письмо. Попробуйте позже.',
          verificationUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verify-email?token=${verificationToken}` // Для отладки
        });
      }
    } catch (error) {
      console.error('Ошибка при отправке email:', error);
      res.status(500).json({ 
        error: 'Ошибка сервера при отправке письма',
        verificationUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verify-email?token=${verificationToken}` // Для отладки
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

// Тестовый endpoint для проверки отправки email (только для разработки)
router.post('/test-email', requireAuth, async (req, res) => {
  try {
    const { email } = req.body;
    const testEmail = email || req.session.userEmail;
    
    if (!testEmail) {
      return res.status(400).json({ error: 'Email не указан' });
    }
    
    const testToken = generateVerificationToken();
    console.log('🧪 Тестовая отправка email...');
    const result = await sendVerificationEmail(testEmail, 'Test User', testToken);
    
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

