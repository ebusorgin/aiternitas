// Socket.IO authentication handlers
// Replaces HTTP auth endpoints with real-time events

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import pool from '../db.mjs';
import { sendVerificationEmail } from '../utils/email.mjs';

// Generate email verification token
function generateVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Store active sessions: socketId -> { sessionId, userId, userName, userEmail }
const activeSessions = new Map();

// Store user rooms: userId -> Set<socketId>
const userRooms = new Map();

export function setupAuthHandlers(io, socket, sessionStore) {
  
  // Register new user
  socket.on('auth:register', async (data, callback) => {
    try {
      const { name, email, password } = data;

      // Validation
      if (!name || !email || !password) {
        return callback({ success: false, error: 'Все поля обязательны' });
      }

      if (password.length < 6) {
        return callback({ success: false, error: 'Пароль должен быть не менее 6 символов' });
      }

      // Check existing user
      const existingUser = await pool.query(
        'SELECT id, google_id FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (existingUser.rows.length > 0) {
        if (existingUser.rows[0].google_id) {
          return callback({ 
            success: false, 
            error: 'Пользователь с таким email уже зарегистрирован через Google. Используйте вход через Google.' 
          });
        }
        return callback({ success: false, error: 'Пользователь с таким email уже существует' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Generate verification token
      const verificationToken = generateVerificationToken();
      const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Create user
      const result = await pool.query(
        `INSERT INTO users (name, email, password, email_verified, email_verification_token, email_verification_expires) 
         VALUES ($1, $2, $3, false, $4, $5) 
         RETURNING id, name, email, avatar, email_verified, created_at`,
        [name, email.toLowerCase(), hashedPassword, verificationToken, verificationExpires]
      );

      const user = result.rows[0];

      // Try to send verification email
      try {
        const emailResult = await sendVerificationEmail(user.email, user.name, verificationToken, socket.handshake.address);
        if (!emailResult.success) {
          console.error(`❌ Не удалось отправить письмо: ${emailResult.error}`);
        }
      } catch (emailError) {
        console.error('Email send error:', emailError);
      }

      // Create session in socket
      const sessionId = `socket_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      socket.userId = user.id;
      socket.userName = user.name;
      socket.userEmail = user.email;
      socket.sessionId = sessionId;

      // Store session
      activeSessions.set(socket.id, {
        sessionId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      });

      // Join user room for broadcasting
      socket.join(`user:${user.id}`);
      if (!userRooms.has(user.id)) {
        userRooms.set(user.id, new Set());
      }
      userRooms.get(user.id).add(socket.id);

      console.log(`✅ Пользователь зарегистрирован через Socket.IO: ${user.email} (id: ${user.id})`);

      callback({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          email_verified: user.email_verified
        },
        message: 'Регистрация успешна'
      });

    } catch (error) {
      console.error('Socket.IO register error:', error);
      callback({ success: false, error: 'Ошибка сервера при регистрации' });
    }
  });

  // Login
  socket.on('auth:login', async (data, callback) => {
    try {
      const { email, password } = data;

      if (!email || !password) {
        return callback({ success: false, error: 'Email и пароль обязательны' });
      }

      // Find user
      const result = await pool.query(
        'SELECT id, name, email, password, avatar, google_id, email_verified FROM users WHERE email = $1',
        [email.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return callback({ success: false, error: 'Неверный email или пароль' });
      }

      const user = result.rows[0];

      // Check if user has password (not Google-only)
      if (!user.password) {
        return callback({ 
          success: false, 
          error: 'Этот аккаунт зарегистрирован через Google. Используйте вход через Google.' 
        });
      }

      // Verify password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return callback({ success: false, error: 'Неверный email или пароль' });
      }

      // Create session
      const sessionId = `socket_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
      socket.userId = user.id;
      socket.userName = user.name;
      socket.userEmail = user.email;
      socket.sessionId = sessionId;

      // Store session
      activeSessions.set(socket.id, {
        sessionId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      });

      // Join user room
      socket.join(`user:${user.id}`);
      if (!userRooms.has(user.id)) {
        userRooms.set(user.id, new Set());
      }
      userRooms.get(user.id).add(socket.id);

      console.log(`✅ Пользователь вошел через Socket.IO: ${user.email} (id: ${user.id})`);

      callback({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          email_verified: user.email_verified
        }
      });

    } catch (error) {
      console.error('Socket.IO login error:', error);
      callback({ success: false, error: 'Ошибка сервера при авторизации' });
    }
  });

  // Logout
  socket.on('auth:logout', (data, callback) => {
    try {
      const userId = socket.userId;
      
      // Remove from user room
      if (userId) {
        socket.leave(`user:${userId}`);
        if (userRooms.has(userId)) {
          userRooms.get(userId).delete(socket.id);
          if (userRooms.get(userId).size === 0) {
            userRooms.delete(userId);
          }
        }
      }

      // Clear session data
      activeSessions.delete(socket.id);
      socket.userId = null;
      socket.userName = null;
      socket.userEmail = null;
      socket.sessionId = null;

      console.log(`✅ Пользователь вышел через Socket.IO (socket: ${socket.id})`);

      if (callback) {
        callback({ success: true });
      }

    } catch (error) {
      console.error('Socket.IO logout error:', error);
      if (callback) {
        callback({ success: false, error: 'Ошибка при выходе' });
      }
    }
  });

  // Check authentication status
  socket.on('auth:check', async (data, callback) => {
    try {
      // First check if socket has userId from previous auth
      if (socket.userId) {
        // Verify user still exists in DB
        const result = await pool.query(
          'SELECT id, name, email, avatar, email_verified, created_at FROM users WHERE id = $1',
          [socket.userId]
        );

        if (result.rows.length > 0) {
          return callback({
            authenticated: true,
            user: result.rows[0]
          });
        }
      }

      // Try to restore session from HTTP cookie if present
      const session = await tryRestoreHttpSession(socket, sessionStore);
      if (session && session.userId) {
        // Verify user exists
        const result = await pool.query(
          'SELECT id, name, email, avatar, email_verified, created_at FROM users WHERE id = $1',
          [session.userId]
        );

        if (result.rows.length > 0) {
          const user = result.rows[0];
          
          // Update socket
          socket.userId = user.id;
          socket.userName = user.name;
          socket.userEmail = user.email;

          // Store session
          activeSessions.set(socket.id, {
            sessionId: session.sessionId || `restored_${Date.now()}`,
            userId: user.id,
            userName: user.name,
            userEmail: user.email
          });

          // Join user room
          socket.join(`user:${user.id}`);
          if (!userRooms.has(user.id)) {
            userRooms.set(user.id, new Set());
          }
          userRooms.get(user.id).add(socket.id);

          console.log(`✅ Сессия восстановлена через HTTP cookie: ${user.email}`);

          return callback({
            authenticated: true,
            user
          });
        }
      }

      callback({ authenticated: false });

    } catch (error) {
      console.error('Socket.IO auth check error:', error);
      callback({ authenticated: false, error: 'Ошибка проверки авторизации' });
    }
  });

  // Update profile name
  socket.on('auth:update-name', async (data, callback) => {
    try {
      if (!socket.userId) {
        return callback({ success: false, error: 'Требуется авторизация' });
      }

      const { name } = data;

      if (!name || name.trim().length === 0) {
        return callback({ success: false, error: 'Имя не может быть пустым' });
      }

      if (name.length > 100) {
        return callback({ success: false, error: 'Имя слишком длинное (максимум 100 символов)' });
      }

      const result = await pool.query(
        `UPDATE users 
         SET name = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING id, name, email, avatar, email_verified`,
        [name.trim(), socket.userId]
      );

      if (result.rows.length === 0) {
        return callback({ success: false, error: 'Пользователь не найден' });
      }

      const user = result.rows[0];
      socket.userName = user.name;

      // Update stored session
      const storedSession = activeSessions.get(socket.id);
      if (storedSession) {
        storedSession.userName = user.name;
      }

      callback({
        success: true,
        user
      });

    } catch (error) {
      console.error('Socket.IO update name error:', error);
      callback({ success: false, error: 'Ошибка сервера' });
    }
  });

  // Handle disconnect - cleanup session
  socket.on('disconnect', () => {
    const userId = socket.userId;
    
    if (userId) {
      if (userRooms.has(userId)) {
        userRooms.get(userId).delete(socket.id);
        if (userRooms.get(userId).size === 0) {
          userRooms.delete(userId);
        }
      }
    }

    activeSessions.delete(socket.id);
    console.log(`🔌 Socket.IO auth disconnect: ${socket.id} (user: ${userId || 'anonymous'})`);
  });
}

// Try to restore session from HTTP cookie
async function tryRestoreHttpSession(socket, sessionStore) {
  return new Promise((resolve) => {
    const cookieHeader = socket.request?.headers?.cookie;
    
    if (!cookieHeader) {
      return resolve(null);
    }

    // Parse cookies
    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.trim().split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=');
        cookies[name] = decodeURIComponent(value);
      }
    });

    let sessionId = cookies['aiternitas.sid'];
    if (!sessionId) {
      return resolve(null);
    }

    // Clean session ID
    try {
      sessionId = decodeURIComponent(sessionId);
    } catch (e) {}
    
    if (sessionId.startsWith('s:')) {
      sessionId = sessionId.substring(2);
    }
    
    if (sessionId.includes('.')) {
      sessionId = sessionId.split('.')[0];
    }

    // Get session from store
    if (sessionStore && sessionStore.get) {
      sessionStore.get(sessionId, (err, session) => {
        if (err || !session) {
          return resolve(null);
        }
        resolve({ ...session, sessionId });
      });
    } else {
      // Fallback: direct DB query
      pool.query(
        'SELECT sess FROM session WHERE sid = $1 AND expire > NOW()',
        [sessionId]
      ).then(result => {
        if (result.rows.length === 0) {
          return resolve(null);
        }
        const sessionData = result.rows[0].sess;
        const session = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
        resolve({ ...session, sessionId });
      }).catch(() => resolve(null));
    }
  });
}

// Export helpers for other handlers
export { activeSessions, userRooms };



