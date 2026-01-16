import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'aiternitas',
});

async function checkContents() {
  try {
    const client = await pool.connect();

    console.log('🔍 Checking table contents...\n');

    // Check user_acess_rights
    console.log('user_acess_rights:');
    const rightsRes = await client.query('SELECT * FROM user_acess_rights');
    if (rightsRes.rows.length === 0) {
      console.log('  (empty)');
    } else {
      rightsRes.rows.forEach(row => {
        console.log(`  User ID: ${row.user_id}, Role: ${row.role}, Created: ${row.created_at}`);
      });
    }

    console.log('\napp_settings:');
    const settingsRes = await client.query('SELECT key, value, description FROM app_settings ORDER BY key');
    if (settingsRes.rows.length === 0) {
      console.log('  (empty)');
    } else {
      settingsRes.rows.forEach(row => {
        console.log(`  ${row.key}: ${row.value} (${row.description})`);
      });
    }

    // Check users table
    console.log('\nusers (first user):');
    const usersRes = await client.query('SELECT id, name, email FROM users LIMIT 1');
    if (usersRes.rows.length === 0) {
      console.log('  (no users)');
    } else {
      const user = usersRes.rows[0];
      console.log(`  ID: ${user.id}, Name: ${user.name}, Email: ${user.email}`);
    }

    client.release();
    await pool.end();

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkContents();
