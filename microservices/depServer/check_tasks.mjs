import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://postgres@127.127.126.56:5432/aiternitas' });
pool.query("SELECT id, title, status FROM tasks")
  .then(res => { console.log(res.rows); pool.end(); })
  .catch(err => { console.error(err); pool.end(); });
