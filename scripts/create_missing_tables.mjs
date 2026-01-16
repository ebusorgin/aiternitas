import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'aiternitas',
});

async function createMissingTables() {
  try {
    console.log('🔧 Creating missing tables...');

    // Check if update_updated_at_column function exists
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
    `).catch(() => { console.log('Function update_updated_at_column already exists or created'); });

    // Create app_settings table
    console.log('Creating app_settings table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create trigger for app_settings
    await pool.query(`
      DROP TRIGGER IF EXISTS update_app_settings_updated_at ON app_settings;
      CREATE TRIGGER update_app_settings_updated_at
          BEFORE UPDATE ON app_settings
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column();
    `).catch(() => { });

    // Insert default settings
    await pool.query(`
      INSERT INTO app_settings (key, value, description)
      VALUES
        ('tor_enabled', 'false', 'Enable TOR proxy for OpenAI API'),
        ('tor_exit_country', 'US', 'TOR exit node country code'),
        ('tor_host', '127.0.0.1', 'TOR SOCKS5 proxy host'),
        ('tor_port', '9050', 'TOR SOCKS5 proxy port')
      ON CONFLICT (key) DO NOTHING
    `).catch(() => { });

    console.log('✅ app_settings table created');

    // Create user_acess_rights table
    console.log('Creating user_acess_rights table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_acess_rights (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ user_acess_rights table created');

    // Check what we created
    const res = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename IN ('app_settings', 'user_acess_rights')
      ORDER BY tablename
    `);

    console.log('\n📋 Created tables:');
    res.rows.forEach(row => {
      console.log(`  ✅ ${row.tablename}`);
    });

    await pool.end();
    console.log('✅ All missing tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
}

createMissingTables();
