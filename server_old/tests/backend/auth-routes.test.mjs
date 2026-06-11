import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import pool from '../../db.mjs';
import authRouter from '../../routes/auth.mjs';

// Создаем тестовое приложение
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, sameSite: 'lax' }
  }));
  
  app.use('/api/auth', authRouter);
  
  return app;
};

describe('Auth Routes', () => {
  let app;
  let testUser = {
    name: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'TestPassword123!'
  };

  beforeAll(async () => {
    app = createTestApp();
    // Очищаем тестовых пользователей
    await pool.query("DELETE FROM users WHERE email LIKE 'test%@example.com'");
  });

  afterAll(async () => {
    // Очистка
    await pool.query("DELETE FROM users WHERE email LIKE 'test%@example.com'");
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
      expect(res.body.user.name).toBe(testUser.name);
    });

    it('should fail with existing email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('уже существует');
    });

    it('should fail with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'invalid-email',
          password: 'password123'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should fail with short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'test2@example.com',
          password: '123'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should fail with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should fail with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('авторизация');
    });

    it('should return user when authenticated', async () => {
      // Сначала логинимся
      const agent = request.agent(app);
      
      await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Проверяем сессию
      const res = await agent
        .get('/api/auth/me')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      const agent = request.agent(app);
      
      // Логин
      await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Logout
      const res = await agent
        .post('/api/auth/logout')
        .expect(200);

      expect(res.body.success).toBe(true);

      // Проверяем что сессия удалена
      const meRes = await agent
        .get('/api/auth/me')
        .expect(401);

      expect(meRes.body.success).toBe(false);
    });
  });

  describe('Session persistence', () => {
    it('should maintain session across multiple requests', async () => {
      const agent = request.agent(app);
      
      // Логин
      await agent
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      // Несколько запросов к /me
      for (let i = 0; i < 3; i++) {
        const res = await agent.get('/api/auth/me').expect(200);
        expect(res.body.user.email).toBe(testUser.email);
      }
    });
  });
});
