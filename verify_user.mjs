
import pool from './server/db.mjs';

async function verify() {
    try {
        await pool.query("UPDATE users SET email_verified = true WHERE email = 'antigravity@test.com'");
        console.log('User verified');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
verify();
