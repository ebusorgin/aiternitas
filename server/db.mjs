import pg from 'pg';
import dotenv from 'dotenv';

// Загружаем .env в самом начале, до создания пула подключений
dotenv.config();

const { Pool } = pg;

const dbConfig = {
  host: process.env.DB_HOST || '127.127.126.56', // Дефолт для Open Server
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'severomorets',
  database: process.env.DB_NAME || 'aiternitas',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Не передаем password если он не определен или пустой
// PostgreSQL будет использовать peer authentication для localhost
if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
  dbConfig.password = String(process.env.DB_PASSWORD);
}

const pool = new Pool(dbConfig);

// Инициализация базы данных
export async function initDatabase() {
  try {
    // Создаем базу данных если не существует
    const adminDbConfig = {
      host: process.env.DB_HOST || '127.127.126.56', // Дефолт для Open Server
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'severomorets',
      database: 'postgres',
    };
    
    // Добавляем password только если он определен и не пустой
    if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
      adminDbConfig.password = String(process.env.DB_PASSWORD);
    }
    
    const adminPool = new Pool(adminDbConfig);

    const dbCheck = await adminPool.query(
      "SELECT 1 FROM pg_database WHERE datname = 'aiternitas'"
    );

    if (dbCheck.rows.length === 0) {
      await adminPool.query('CREATE DATABASE aiternitas');
      console.log('✅ База данных aiternitas создана');
    }

    await adminPool.end();

    // Создаем таблицу пользователей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        avatar VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Таблица users создана/проверена');
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
    throw error;
  }
}

export default pool;

