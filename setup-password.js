// Скрипт для установки пароля PostgreSQL
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || '127.127.126.56',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  database: 'postgres',
});

const password = process.argv[2] || 'carFds43';

try {
  await pool.query(`ALTER USER postgres WITH PASSWORD '${password}'`);
  console.log(`✅ Пароль для пользователя postgres успешно установлен: ${password}`);
  await pool.end();
} catch (error) {
  console.error('❌ Ошибка при установке пароля:', error.message);
  await pool.end();
  process.exit(1);
}

