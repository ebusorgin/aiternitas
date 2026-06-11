import express from 'express';
import pool from '../db.mjs';

const router = express.Router();

// Получить статистику платформы
router.get('/', async (req, res) => {
  try {
    // Количество пользователей
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(usersResult.rows[0].count) || 0;

    // Последние зарегистрированные пользователи (без персональных данных)
    const recentUsersResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL \'7 days\''
    );
    const recentUsers = parseInt(recentUsersResult.rows[0].count) || 0;

    res.json({
      success: true,
      stats: {
        totalUsers: userCount,
        newUsersLastWeek: recentUsers,
        projects: 2, // conference и balance
        activeProjects: 2
      }
    });
  } catch (error) {
    console.error('Ошибка получения статистики:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;

