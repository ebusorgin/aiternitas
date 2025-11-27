import express from 'express';
import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import pool from '../db.mjs';
import { requireAuth } from '../middleware/auth.mjs';

const router = express.Router();

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

    // Создание пользователя
    const result = await pool.query(
      `INSERT INTO users (name, email, password) 
       VALUES ($1, $2, $3) 
       RETURNING id, name, email, avatar, created_at`,
      [name, email.toLowerCase(), hashedPassword]
    );

    const user = result.rows[0];

    // Автоматический вход после регистрации
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;

    res.status(201).json({
      success: true,
      message: 'Регистрация успешна',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
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
      'SELECT id, name, email, password, avatar, google_id FROM users WHERE email = $1',
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

    // Создание сессии
    req.session.userId = user.id;
    req.session.userName = user.name;
    req.session.userEmail = user.email;

    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
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
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, avatar, created_at FROM users WHERE id = $1',
      [req.session.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Ошибка получения пользователя:', error);
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
        // Пользователь существует с таким email - связываем Google ID
        user = emailResult.rows[0];
        await pool.query(
          'UPDATE users SET google_id = $1, avatar = COALESCE(avatar, $2), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [googleId, picture, user.id]
        );
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
      } else {
        // Создаем нового пользователя
        const newUserResult = await pool.query(
          `INSERT INTO users (name, email, google_id, avatar) 
           VALUES ($1, $2, $3, $4) 
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

    // Перенаправляем на фронтенд
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3001'}/profile`);
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
        user = emailResult.rows[0];
        await pool.query(
          'UPDATE users SET google_id = $1, avatar = COALESCE(avatar, $2), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [googleId, picture, user.id]
        );
        if (picture && !user.avatar) {
          user.avatar = picture;
        }
      } else {
        const newUserResult = await pool.query(
          `INSERT INTO users (name, email, google_id, avatar) 
           VALUES ($1, $2, $3, $4) 
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

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Ошибка верификации Google токена:', error);
    res.status(500).json({ error: 'Ошибка верификации токена' });
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

export default router;

