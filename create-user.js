// Скрипт для создания пользователя PostgreSQL
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || '127.127.126.56',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'carFds43',
  database: 'postgres',
});

const username = process.argv[2] || 'severomorets';
const password = process.argv[3] || 'carFds43';

try {
  // Создаем пользователя
  await pool.query(`CREATE USER ${username} WITH PASSWORD '${password}'`);
  console.log(`✅ Пользователь ${username} успешно создан`);
  
  // Даем права на создание баз данных (опционально)
  await pool.query(`ALTER USER ${username} CREATEDB`);
  console.log(`✅ Права CREATEDB выданы пользователю ${username}`);
  
  // Даем все права на базу данных aiternitas
  await pool.query(`GRANT ALL PRIVILEGES ON DATABASE aiternitas TO ${username}`);
  console.log(`✅ Права на базу данных aiternitas выданы пользователю ${username}`);
  
  // Подключаемся к базе aiternitas и даем права на схему public
  const aiternitasPool = new Pool({
    host: process.env.DB_HOST || '127.127.126.56',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'carFds43',
    database: 'aiternitas',
  });
  
  await aiternitasPool.query(`GRANT ALL PRIVILEGES ON SCHEMA public TO ${username}`);
  await aiternitasPool.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${username}`);
  await aiternitasPool.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${username}`);
  await aiternitasPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${username}`);
  await aiternitasPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${username}`);
  console.log(`✅ Права на схему public и таблицы выданы пользователю ${username}`);
  
  await aiternitasPool.end();
  await pool.end();
  
  console.log(`\n✅ Пользователь ${username} полностью настроен!`);
  console.log(`\nНастройки для подключения:`);
  console.log(`  Host: 127.127.126.56`);
  console.log(`  Port: 5432`);
  console.log(`  Database: aiternitas`);
  console.log(`  Username: ${username}`);
  console.log(`  Password: ${password}`);
} catch (error) {
  if (error.message.includes('already exists')) {
    console.log(`⚠️  Пользователь ${username} уже существует. Обновляю пароль...`);
    try {
      await pool.query(`ALTER USER ${username} WITH PASSWORD '${password}'`);
      console.log(`✅ Пароль для пользователя ${username} обновлен`);
      
      // Обновляем права
      await pool.query(`GRANT ALL PRIVILEGES ON DATABASE aiternitas TO ${username}`);
      
      const aiternitasPool = new Pool({
        host: process.env.DB_HOST || '127.127.126.56',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'carFds43',
        database: 'aiternitas',
      });
      
      await aiternitasPool.query(`GRANT ALL PRIVILEGES ON SCHEMA public TO ${username}`);
      await aiternitasPool.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${username}`);
      await aiternitasPool.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${username}`);
      await aiternitasPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${username}`);
      await aiternitasPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${username}`);
      
      await aiternitasPool.end();
      await pool.end();
      
      console.log(`✅ Права обновлены для пользователя ${username}`);
    } catch (updateError) {
      console.error('❌ Ошибка при обновлении:', updateError.message);
      await pool.end();
      process.exit(1);
    }
  } else {
    console.error('❌ Ошибка при создании пользователя:', error.message);
    await pool.end();
    process.exit(1);
  }
}

