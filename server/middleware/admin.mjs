import pool from '../db.mjs';

export const requireAdmin = async (req, res, next) => {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }

    try {
        const result = await pool.query(
            'SELECT 1 FROM user_acess_rights WHERE user_id = $1',
            [req.session.userId]
        );

        if (result.rows.length === 0) {
            return res.status(403).json({ error: 'Доступ запрещен' });
        }

        next();
    } catch (error) {
        console.error('Ошибка проверки прав администратора:', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};
