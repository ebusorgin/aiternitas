import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://postgres@127.127.126.56:5432/aiternitas' });
pool.query("UPDATE tasks SET status = 'pending' WHERE status IN ('review', 'in_progress')")
  .then(res => { console.log('Tasks reset:', res.rowCount); pool.end(); })
  .catch(err => { console.error(err); pool.end(); });
