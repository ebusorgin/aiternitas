import express from 'express';
import pool from '../db.mjs';
import { requireAdmin } from '../middleware/admin.mjs';

const router = express.Router();

// Middleware для проверки админа для всех роутов
router.use(requireAdmin);

// Проверка статуса админа
router.get('/check', (req, res) => {
    res.json({ isAdmin: true });
});

// Получение списка пользователей (пример админской функции)
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, name, email, created_at, email_verified, google_id FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Ошибка получения списка пользователей:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Добавление админа (только для существующих админов)
router.post('/add', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email обязателен' });
        }

        const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        const userId = userResult.rows[0].id;

        await pool.query(
            'INSERT INTO user_acess_rights (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
            [userId]
        );

        res.json({ success: true, message: `Пользователь ${email} назначен администратором` });
    } catch (error) {
        console.error('Ошибка добавления админа:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

export default router;
