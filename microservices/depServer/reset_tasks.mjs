import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgres://aiternitas:aiternitassecret@localhost:5432/task_management' });
pool.query("UPDATE tasks SET status = 'pending' WHERE status = 'in_progress'")
  .then(res => { console.log('Tasks reset:', res.rowCount); pool.end(); })
  .catch(err => { console.error(err); pool.end(); });
