import pool from './db.mjs';

console.log('🔍 Проверка сессий в БД...\n');

try {
  const result = await pool.query(`
    SELECT 
      sid, 
      sess->>'userId' as user_id,
      sess->>'userEmail' as user_email,
      expire
    FROM session 
    ORDER BY expire DESC 
    LIMIT 10
  `);

  if (result.rows.length === 0) {
    console.log('❌ Нет активных сессий в БД');
  } else {
    console.log(`✅ Найдено ${result.rows.length} сессий:\n`);
    result.rows.forEach((row, i) => {
      console.log(`--- Сессия ${i + 1} ---`);
      console.log('  SID:', row.sid.substring(0, 20) + '...');
      console.log('  User ID:', row.user_id || 'не авторизован');
      console.log('  User Email:', row.user_email || 'N/A');
      console.log('  Expire:', row.expire);

      console.log('');
    });
  }

  // Проверяем общее количество
  const count = await pool.query('SELECT COUNT(*) FROM session');
  console.log(`📊 Всего сессий в БД: ${count.rows[0].count}`);

} catch (err) {
  console.error('❌ Ошибка:', err.message);
} finally {
  await pool.end();
}
