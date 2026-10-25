import pg from 'pg';

const { Pool } = pg;

const resolvedDbUser =
  process.env.DB_USER || process.env.PGUSER || process.env.USER;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'aiternitas',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

if (resolvedDbUser) {
  dbConfig.user = resolvedDbUser;
}

if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
  dbConfig.password = String(process.env.DB_PASSWORD);
}

const pool = new Pool(dbConfig);

export default pool;
