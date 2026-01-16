
import pool from './server/db.mjs';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const email = 'severomorets@gmail.com';
const newPass = 'carFds43';

async function fixUser() {
    console.log('Fixing user ' + email + '...');
    try {
        const hash = await bcrypt.hash(newPass, 10);

        // Check if user exists first
        const check = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (check.rows.length === 0) {
            console.log('User not found. Creating user...');
            const reg = await pool.query(
                "INSERT INTO users (name, email, password, email_verified) VALUES ('Admin', $1, $2, true) RETURNING *",
                [email, hash]
            );
            console.log('User created:', reg.rows[0]);
        } else {
            console.log('User found. Updating password and verification...');
            const res = await pool.query(
                "UPDATE users SET password = $1, email_verified = true WHERE email = $2 RETURNING id, email, email_verified",
                [hash, email]
            );
            console.log('User updated:', res.rows[0]);
        }
    } catch (e) {
        console.error('Error fixing user:', e);
    } finally {
        console.log('Exiting...');
        await pool.end(); // Make sure to close the pool!
        process.exit(0);
    }
}
fixUser();
