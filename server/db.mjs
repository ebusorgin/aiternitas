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

    // Создаем таблицу для хранения всех писем
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        sender VARCHAR(255) NOT NULL,
        recipient VARCHAR(255) NOT NULL,
        subject TEXT,
        body TEXT,
        headers TEXT,
        size INTEGER,
        client_ip VARCHAR(45),
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
        status VARCHAR(50) DEFAULT 'delivered',
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Индексы для быстрого поиска
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_recipient ON emails(recipient)
    `).catch(() => {}); // Игнорируем ошибку если индекс уже существует

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at)
    `).catch(() => {});

    // Функция для автоматического обновления updated_at
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `).catch(() => {});

    // Триггер для автоматического обновления updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS update_emails_updated_at ON emails;
      CREATE TRIGGER update_emails_updated_at
          BEFORE UPDATE ON emails
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    console.log('✅ Таблица emails создана/проверена');

    // Создаем единую таблицу для всех элементов (scenes, workers, blocks)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS elements (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        element_type VARCHAR(50) NOT NULL CHECK (element_type IN ('scene', 'worker', 'block')),
        type VARCHAR(50),
        parent_id VARCHAR(255) REFERENCES elements(id) ON DELETE SET NULL,
        position_2d JSONB,
        position JSONB,
        size_2d JSONB,
        size JSONB,
        color VARCHAR(50),
        emissive VARCHAR(50),
        background VARCHAR(50),
        show_grid BOOLEAN,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Индексы для elements
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_elements_user_id ON elements(user_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_elements_parent_id ON elements(parent_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_elements_element_type ON elements(element_type)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_elements_created_at ON elements(created_at)
    `).catch(() => {});

    // Триггер для автоматического обновления updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS update_elements_updated_at ON elements;
      CREATE TRIGGER update_elements_updated_at
          BEFORE UPDATE ON elements
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    console.log('✅ Таблица elements создана/проверена');

    // Создаем таблицу для хранения связей между элементами
    await pool.query(`
      CREATE TABLE IF NOT EXISTS elements_connections (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        from_element_id VARCHAR(255) NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
        to_element_id VARCHAR(255) NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'one-way',
        bidirectional BOOLEAN NOT NULL DEFAULT false,
        label VARCHAR(255),
        color VARCHAR(50) NOT NULL DEFAULT '#ffffff',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Индексы для elements_connections
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_elements_connections_user_id ON elements_connections(user_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_elements_connections_from_element ON elements_connections(from_element_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_elements_connections_to_element ON elements_connections(to_element_id)
    `).catch(() => {});

    // Триггер для автоматического обновления updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS update_elements_connections_updated_at ON elements_connections;
      CREATE TRIGGER update_elements_connections_updated_at
          BEFORE UPDATE ON elements_connections
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    console.log('✅ Таблица elements_connections создана/проверена');

    // Создаем таблицу для хранения блок-схем (flowcharts)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flowcharts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL DEFAULT 'Моя схема',
        elements JSONB NOT NULL DEFAULT '[]',
        connections JSONB NOT NULL DEFAULT '[]',
        view_state JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `);

    // Индексы для flowcharts
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_flowcharts_user_id ON flowcharts(user_id)
    `).catch(() => {});

    // Триггер для автоматического обновления updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS update_flowcharts_updated_at ON flowcharts;
      CREATE TRIGGER update_flowcharts_updated_at
          BEFORE UPDATE ON flowcharts
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    console.log('✅ Таблица flowcharts создана/проверена');
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
    throw error;
  }
}

export default pool;

