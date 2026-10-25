/*
 * ecosystem.config.js — декларация микросервисов Aiternitas для PM2.
 *
 * PM2 запускает каждый сервис как отдельное приложение с фиксированным именем,
 * рабочим каталогом и файлами логов. Веб-морда (tools/service-manager.mjs)
 * управляет именно этими приложениями через CLI `pm2`.
 *
 * Использование:
 *   npx pm2 start ecosystem.config.js            # запустить все
 *   npx pm2 start ecosystem.config.js --only user # запустить один (name=user)
 *   npx pm2 stop <name> | pm2 restart <name> | pm2 delete <name>
 *   npx pm2 logs <name>                           # посмотреть логи
 *   npx pm2 save                                  # запомнить набор для resurrect
 */
const path = require('path');

const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, 'logs');

// Единый шаблон для всех Node-микросервисов: cwd = папка сервиса, entry = index.mjs.
const nodeApp = (name, dir, opts = {}) => ({
  name,
  cwd: path.join(ROOT, dir),
  script: 'index.mjs',
  // Файлы логов (веб-морда читает их в реальном времени).
  output: path.join(LOG_DIR, `${name}.out.log`),
  error: path.join(LOG_DIR, `${name}.error.log`),
  merge_logs: true,
  log_date_format: 'YYYY-MM-DD HH:mm:ss',
  time: true,
  autorestart: true,
  watch: false,
  max_memory_restart: '768M',
  min_uptime: '3s',
  restart_delay: 2000,
  exp_backoff_restart_delay: 200,
  env: { NODE_ENV: 'development', ...opts.env },
  // gateway грузит .env через dotenv.config() от cwd, а сам .env лежит в корне —
  // передаём его через --env-file (путь резолвится относительно cwd сервиса).
  ...(opts.node_args ? { node_args: opts.node_args } : {}),
});

module.exports = {
  apps: [
    nodeApp('gateway', 'microservices/gatewayServer', { node_args: '--env-file=../../.env' }),
    nodeApp('socket', 'microservices/socketServer'),
    nodeApp('user', 'microservices/userServer'),
    nodeApp('ai', 'microservices/aiServer'),
    nodeApp('dep', 'microservices/depServer'),
    nodeApp('worker', 'microservices/workerServer'),
    nodeApp('sandbox', 'microservices/sandboxServer'),
    nodeApp('integration', 'microservices/integrationServer'),
    {
      // Фронтенд: Vite из корневого node_modules (hoisted через npm workspaces).
      name: 'client',
      cwd: path.join(ROOT, 'client'),
      script: path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      output: path.join(LOG_DIR, 'client.out.log'),
      error: path.join(LOG_DIR, 'client.error.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true,
      autorestart: true,
      watch: false,
      min_uptime: '3s',
      restart_delay: 2000,
      env: { NODE_ENV: 'development' },
    },
  ],
};
