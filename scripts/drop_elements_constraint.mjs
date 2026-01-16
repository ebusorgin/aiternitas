import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function dropConstraint() {
    const client = await pool.connect();
    try {
        console.log('🚀 Attempting to drop constraint elements_element_type_check...');
        await client.query(`
            DO $$ 
            BEGIN
              IF EXISTS (
                SELECT 1 FROM information_schema.constraint_column_usage 
                WHERE table_name = 'elements' AND constraint_name = 'elements_element_type_check'
              ) THEN
                ALTER TABLE elements DROP CONSTRAINT elements_element_type_check;
                RAISE NOTICE 'Constraint elements_element_type_check dropped successfully.';
              ELSE
                RAISE NOTICE 'Constraint elements_element_type_check does not exist.';
              END IF;
            END $$;
        `);
        console.log('✅ Finished checking/dropping constraint.');
    } catch (error) {
        console.error('❌ Error dropping constraint:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

dropConstraint();
