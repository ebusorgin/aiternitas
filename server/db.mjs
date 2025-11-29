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

    // Создаем таблицу для хранения сцен (теперь только метаданные)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scenes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Добавляем колонку description если её нет
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'scenes' AND column_name = 'description'
        ) THEN
          ALTER TABLE scenes ADD COLUMN description TEXT;
        END IF;
      END $$;
    `);

    // Добавляем колонки для иерархии и позиции в 2D
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'scenes' AND column_name = 'parent_id'
        ) THEN
          ALTER TABLE scenes ADD COLUMN parent_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'scenes' AND column_name = 'position_2d'
        ) THEN
          ALTER TABLE scenes ADD COLUMN position_2d JSONB DEFAULT '[0, 0]'::jsonb;
        END IF;
        
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'scenes' AND column_name = 'size_2d'
        ) THEN
          ALTER TABLE scenes ADD COLUMN size_2d JSONB DEFAULT '[200, 150]'::jsonb;
        END IF;
      END $$;
    `);

    // Создаем таблицу для хранения сущностей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id VARCHAR(255) PRIMARY KEY,
        scene_id INTEGER REFERENCES scenes(id) ON DELETE SET NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(50) NOT NULL DEFAULT 'box',
        color VARCHAR(50) NOT NULL DEFAULT '#3b82f6',
        position JSONB NOT NULL DEFAULT '[0, 0, 0]',
        size JSONB NOT NULL DEFAULT '[1, 1, 1]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Создаем таблицу для хранения связей между сущностями
    await pool.query(`
      CREATE TABLE IF NOT EXISTS connections (
        id VARCHAR(255) PRIMARY KEY,
        scene_id INTEGER REFERENCES scenes(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        from_entity_id VARCHAR(255) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        to_entity_id VARCHAR(255) NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'one-way',
        bidirectional BOOLEAN NOT NULL DEFAULT false,
        label VARCHAR(255),
        color VARCHAR(50) NOT NULL DEFAULT '#ffffff',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Индексы для быстрого поиска
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scenes_user_id ON scenes(user_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scenes_created_at ON scenes(created_at)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_entities_scene_id ON entities(scene_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_entities_user_id ON entities(user_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_connections_scene_id ON connections(scene_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_connections_from_entity ON connections(from_entity_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_connections_to_entity ON connections(to_entity_id)
    `).catch(() => {});

    // Создаем таблицу для связей между сценами
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scene_connections (
        id VARCHAR(255) PRIMARY KEY,
        from_scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
        to_scene_id INTEGER NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'one-way',
        bidirectional BOOLEAN NOT NULL DEFAULT false,
        label VARCHAR(255),
        color VARCHAR(50) NOT NULL DEFAULT '#ffffff',
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Индексы для scene_connections
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scene_connections_from_scene ON scene_connections(from_scene_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scene_connections_to_scene ON scene_connections(to_scene_id)
    `).catch(() => {});

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scene_connections_user_id ON scene_connections(user_id)
    `).catch(() => {});

    // Индексы для иерархии сцен
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_scenes_parent_id ON scenes(parent_id)
    `).catch(() => {});

    // Триггеры для автоматического обновления updated_at
    await pool.query(`
      DROP TRIGGER IF EXISTS update_scenes_updated_at ON scenes;
      CREATE TRIGGER update_scenes_updated_at
          BEFORE UPDATE ON scenes
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await pool.query(`
      DROP TRIGGER IF EXISTS update_entities_updated_at ON entities;
      CREATE TRIGGER update_entities_updated_at
          BEFORE UPDATE ON entities
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    await pool.query(`
      DROP TRIGGER IF EXISTS update_connections_updated_at ON connections;
      CREATE TRIGGER update_connections_updated_at
          BEFORE UPDATE ON connections
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => {});

    console.log('✅ Таблицы scenes, entities и connections созданы/проверены');
    return true;
  } catch (error) {
    console.error('❌ Ошибка инициализации БД:', error);
    throw error;
  }
}

export default pool;

