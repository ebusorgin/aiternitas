import { initDatabase } from '../server/db.mjs';

console.log('🚀 Initializing database on remote server...');

initDatabase()
  .then(() => {
    console.log('✅ Database initialization completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  });
