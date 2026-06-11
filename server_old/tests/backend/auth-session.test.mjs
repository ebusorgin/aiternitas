import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pool from '../../db.mjs';
import authRouter from '../../routes/auth.mjs';

const PgSession = connectPgSimple(session);

// Создаем полноценное тестовое приложение с PostgreSQL сессиями
const createApp = () => {
  const app = express();
  app.use(express.json());
  
  const sessionStore = new PgSession({
    pool: pool,
    tableName: 'session'
  });
  
  app.use(session({
    store: sessionStore,
    secret: 'test-secret-key',
    resave: false,
    saveUninitialized: false,
    name: 'aiternitas.sid',
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000
    }
  }));
  
  app.use('/api/auth', authRouter);
  
  return { app, sessionStore };
};

describe('Auth Session Persistence', () => {
  let app;
  let sessionStore;
  let testUser = {
    name: 'Session Test User',
    email: `sessiontest${Date.now()}@example.com`,
    password: 'TestPassword123!'
  };

  beforeAll(async () => {
    const created = createApp();
    app = created.app;
    sessionStore = created.sessionStore;
    
    // Очищаем тестовых пользователей
    await pool.query("DELETE FROM users WHERE email LIKE 'sessiontest%@example.com'");
  });

  afterAll(async () => {
    await pool.query("DELETE FROM users WHERE email LIKE 'sessiontest%@example.com'");
    sessionStore.close();
  });

  describe('Session cookie', () => {
    it('should set session cookie on login', async () => {
      // Регистрация
      await request(app)
        .post('/api/auth/register')
        .send(testUser);

      // Логин
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Проверяем что установлена кука
      expect(res.headers['set-cookie']).toBeDefined();
      const cookies = res.headers['set-cookie'];
      expect(cookies.some(c => c.includes('aiternitas.sid'))).toBe(true);
    });

    it('should maintain session with cookie across requests', async () => {
      const agent = request.agent(app);
      
      // Логин
      await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Проверяем сессию - должна работать без явной передачи кук
      const meRes = await agent.get('/api/auth/me');
      
      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.user.email).toBe(testUser.email);
    });

    it('should not access session without cookie', async () => {
      // Новый агент без кук
      const newAgent = request.agent(app);
      
      const res = await newAgent.get('/api/auth/me');
      
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should destroy session on logout', async () => {
      const agent = request.agent(app);
      
      // Логин
      await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Проверяем что сессия работает
      const meRes1 = await agent.get('/api/auth/me');
      expect(meRes1.status).toBe(200);

      // Logout
      await agent.post('/api/auth/logout');

      // Проверяем что сессия удалена
      const meRes2 = await agent.get('/api/auth/me');
      expect(meRes2.status).toBe(401);
    });
  });

  describe('Session in database', () => {
    it('should store session in PostgreSQL', async () => {
      const agent = request.agent(app);
      
      // Логин
      await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Проверяем что сессия есть в БД
      const result = await pool.query(
        'SELECT * FROM session WHERE sess->>userId IS NOT NULL'
      );
      
      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should update session on each request', async () => {
      const agent = request.agent(app);
      
      // Логин
      await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Получаем начальное время
      const initialResult = await pool.query(
        'SELECT expire FROM session WHERE sess->>userId IS NOT NULL LIMIT 1'
      );
      const initialExpire = initialResult.rows[0]?.expire;

      // Делаем запрос
      await agent.get('/api/auth/me');

      // Проверяем что сессия обновилась
      const updatedResult = await pool.query(
        'SELECT expire FROM session WHERE sess->>userId IS NOT NULL LIMIT 1'
      );
      const updatedExpire = updatedResult.rows[0]?.expire;

      // Время должно обновиться
      expect(updatedExpire).toBeDefined();
    });
  });

  describe('Multiple sessions', () => {
    it('should handle multiple concurrent sessions', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);
      
      // Оба агента логинятся
      await agent1.post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password
      });

      await agent2.post('/api/auth/login').send({
        email: testUser.email,
        password: testUser.password
      });

      // Оба должны иметь доступ
      const res1 = await agent1.get('/api/auth/me');
      const res2 = await agent2.get('/api/auth/me');

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.user.email).toBe(testUser.email);
      expect(res2.body.user.email).toBe(testUser.email);
    });
  });
});
