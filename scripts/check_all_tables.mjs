import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'aiternitas',
});

async function checkAllTables() {
  try {
    const client = await pool.connect();
    console.log('🔌 Connected to database');

    // Get all tables
    const res = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('\n📋 All tables in database:');
    res.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

    // Check specific tables we're interested in
    const importantTables = ['users', 'session', 'emails', 'elements', 'elements_connections', 'element_parent_child_connections', 'task_columns', 'tasks', 'task_comments', 'app_settings', 'user_acess_rights'];

    console.log('\n🔍 Checking important tables:');
    for (const table of importantTables) {
      const exists = res.rows.some(r => r.tablename === table);
      if (exists) {
        console.log(`  ✅ ${table} exists`);
      } else {
        console.log(`  ❌ ${table} MISSING`);
      }
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAllTables();
