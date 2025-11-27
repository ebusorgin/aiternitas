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
        password VARCHAR(255),
        google_id VARCHAR(255) UNIQUE,
        avatar VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Добавляем колонку google_id если её нет
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'google_id'
        ) THEN
          ALTER TABLE users ADD COLUMN google_id VARCHAR(255) UNIQUE;
        END IF;
      END $$;
    `);
    
    // Убираем NOT NULL ограничение с password, если оно есть (для Google OAuth)
    await pool.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' 
          AND column_name = 'password' 
          AND is_nullable = 'NO'
        ) THEN
          ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
        END IF;
      END $$;
    `);
    
    // Добавляем колонки для верификации email
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'email_verified'
        ) THEN
          ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT false;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'email_verification_token'
        ) THEN
          ALTER TABLE users ADD COLUMN email_verification_token VARCHAR(255);
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'users' AND column_name = 'email_verification_expires'
        ) THEN
          ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP;
        END IF;
      END $$;
    `);

    console.log('✅ Таблица users создана/проверена');

    // Создаем таблицу для сессий (для connect-pg-simple)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT session_pkey PRIMARY KEY (sid)
      )
    `);

    // Создаем индекс для быстрого поиска по expire
    await pool.query(`
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire)
    `);

    console.log('✅ Таблица session создана/проверена');
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
    throw error;
  }
}

export default pool;

