import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;

// Try different database configurations
const dbConfigs = [
    // Production config (server)
    {
        name: 'Production Server',
        host: '82.146.44.126',
        port: 5432,
        user: 'severomorets',
        database: 'aiternitas',
        password: process.env.DB_PASSWORD_REMOTE || process.env.DB_PASSWORD
    },
    // Local config for reference
    {
        name: 'Local Development',
        host: process.env.DB_HOST || '127.127.126.56',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'severomorets',
        database: process.env.DB_NAME || 'aiternitas',
        password: process.env.DB_PASSWORD
    }
];

async function verifyRemoteTables() {
    let connected = false;

    for (const config of dbConfigs) {
        try {
            console.log(`\n🔌 Trying to connect to ${config.name}...`);
            console.log(`   Host: ${config.host}:${config.port}, DB: ${config.database}, User: ${config.user}`);

            const pool = new Pool(config);
            const client = await pool.connect();
            console.log(`✅ Connected to ${config.name}!`);

            const tables = ['users', 'session', 'emails', 'elements', 'elements_connections', 'flowcharts', 'task_columns', 'tasks', 'task_comments', 'app_settings', 'user_acess_rights'];

            console.log('\n🔍 Verifying tables...');

            for (const table of tables) {
                const res = await client.query(`
                    SELECT EXISTS (
                      SELECT FROM information_schema.tables
                      WHERE table_schema = 'public'
                      AND table_name = $1
                    );
                  `, [table]);

                const exists = res.rows[0].exists;
                if (exists) {
                    console.log(`✅ Table '${table}' exists.`);

                    // Count rows
                    const countRes = await client.query(`SELECT COUNT(*) FROM ${table}`);
                    console.log(`   Rows: ${countRes.rows[0].count}`);
                } else {
                    console.error(`❌ Table '${table}' DOES NOT exist!`);
                }
            }

            // Check user_acess_rights content
            console.log('\n🔍 Checking user_acess_rights content...');
            const rightsRes = await client.query('SELECT * FROM user_acess_rights');
            if (rightsRes.rows.length > 0) {
                console.log('✅ user_acess_rights has data:');
                rightsRes.rows.forEach(row => {
                    console.log(`   User ID: ${row.user_id}, Role: ${row.role}`);
                });
            } else {
                console.log('⚠️  user_acess_rights is empty');
            }

            client.release();
            await pool.end();
            connected = true;
            break; // Stop after first successful connection

        } catch (err) {
            console.error(`❌ Failed to connect to ${config.name}:`, err.message);
        }
    }

    if (!connected) {
        console.log('\n❌ Could not connect to any database configuration.');
        console.log('💡 Make sure:');
        console.log('   1. PostgreSQL is running on the server');
        console.log('   2. Firewall allows connections on port 5432');
        console.log('   3. Database credentials are correct');
        console.log('   4. Environment variables are set properly');
    }
}

verifyRemoteTables().catch(console.error);
