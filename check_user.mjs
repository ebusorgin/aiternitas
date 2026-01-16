
import pool from './server/db.mjs';

async function checkUser() {
    try {
        const res = await pool.query("SELECT id, email, name, email_verified, created_at FROM users WHERE email = 'severomorets@gmail.com'");
        console.log('User found:', res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
checkUser();
