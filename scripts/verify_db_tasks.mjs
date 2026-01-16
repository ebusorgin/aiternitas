import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from root
dotenv.config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;

const dbConfig = {
    host: process.env.DB_HOST || '127.127.126.56',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'severomorets',
    database: process.env.DB_NAME || 'aiternitas',
};

if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
    dbConfig.password = String(process.env.DB_PASSWORD);
}

const pool = new Pool(dbConfig);

async function verifyTables() {
    try {
        console.log('🔌 Connecting to database...');
        const client = await pool.connect();
        console.log('✅ Connected.');

        const tables = ['users', 'session', 'emails', 'elements', 'elements_connections', 'element_parent_child_connections', 'task_columns', 'tasks', 'task_comments', 'app_settings', 'user_acess_rights'];

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

        client.release();
        await pool.end();
        console.log('\n🏁 Verification complete.');

    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

verifyTables();
