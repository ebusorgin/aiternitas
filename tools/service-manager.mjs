#!/usr/bin/env node
/*
 * service-manager.mjs — веб-морда для управления микросервисами Aiternitas через PM2.
 *
 * Роли разделены:
 *   • PM2 запускает/останавливает сами сервисы (конфиг: ecosystem.config.js в корне).
 *   • Этот файл — лишь контроллер+наблюдатель: дергает CLI `pm2` и показывает
 *     состояние и логи в браузере. Его ты запускаешь ВРУЧНУЮ:
 *         node tools/service-manager.mjs
 *     затем открываешь http://aiternitas.local:3010  (или http://localhost:3010).
 *
 * Логи в реальном времени читаются напрямую из файлов PM2 (logs/<name>.out.log
 * и logs/<name>.error.log, заданных в ecosystem.config.js) и стримятся в браузер
 * через Server-Sent Events. Внешних зависимостей у самой морды нет — только
 * встроенные модули Node. Требуется PM2 (devDependency проекта: node_modules/pm2).
 *
 * Конфиг:
 *   MANAGER_PORT — порт веб-морды (по умолчанию 3010).
 *
 * ВАЖНО: закрытие этой морды (Ctrl+C) НЕ останавливает сервисы — они живут в
 * независимом PM2-демоне. Управление сервисами:pm2 start/stop/restart/delete.
 */
import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MANAGER_PORT = parseInt(process.env.MANAGER_PORT || '3010', 10);
const ECOSYSTEM = path.join(ROOT, 'ecosystem.config.js');
const PM2_BIN = path.join(ROOT, 'node_modules', 'pm2', 'bin', 'pm2');
const LOG_DIR = path.join(ROOT, 'logs');

const POLL_MS = 2500;        // опрос pm2 jlist + портов
const BUS_POLL_MS = 2000;    // опрос RabbitMQ management API (очереди/связи/коннекты)
const TAIL_MS = 800;         // опрос файлов логов (пока открыта вкладка с логами)
const LOG_HISTORY_LINES = 800;

/* ---------------------------------------------------------------------------
 * Реестр сервисов — единый источник правды для имён, портов и логов.
 * name        — канон, совпадает с ecosystem.config.js (имя приложения PM2)
 * ------------------------------------------------------------------------- */
const SERVICES = [
  { name: 'gateway',     port: 3001, title: 'API Gateway',       role: 'Прокси /api/* и WebSocket' },
  { name: 'socket',      port: 4009, title: 'SocketGate',        role: 'Веб-сокет-гейт: сессии + мост в RabbitMQ' },
  { name: 'user',        port: 4002, title: 'UserServer',        role: 'Auth, пользователи, бизнес-логика (consumer шины)' },
  { name: 'ai',          busOnly: true, title: 'AiServer',       role: 'Интеграция с LLM (Ollama) · чистый consumer шины, без порта' },
  { name: 'dep',         busOnly: true, title: 'DepServer',      role: 'Оркестратор задач · consumer шины, без порта' },
  { name: 'worker',      busOnly: true, title: 'WorkerServer',   role: 'Фоновые воркеры (RabbitMQ) · без порта' },
  { name: 'sandbox',     busOnly: true, title: 'SandboxServer',  role: 'Изолированное исполнение кода · consumer шины, без порта' },
  { name: 'integration', port: 4007, title: 'IntegrationServer', role: 'Плагины / внешние интеграции' },
  { name: 'client',      port: 3000, title: 'Client (Vite)',     role: 'Фронтенд React + Vite' },
];
const NAMES = SERVICES.map((s) => s.name);
const OUT_LOG = (name) => path.join(LOG_DIR, name + '.out.log');
const ERR_LOG = (name) => path.join(LOG_DIR, name + '.error.log');

// Состояния (канон для UI): unloaded | stopped | starting | running | errored
const S = { UNLOADED: 'unloaded', STOPPED: 'stopped', STARTING: 'starting', RUNNING: 'running', ERRORED: 'errored' };

// Отображаемые подписи состояний.
const STATE_LABEL = {
  [S.UNLOADED]: 'не загружен',
  [S.STOPPED]: 'остановлен',
  [S.STARTING]: 'запуск…',
  [S.RUNNING]: 'работает',
  [S.ERRORED]: 'ошибка',
};

// Маппинг raw-статуса PM2 → наше состояние.
function mapStatus(pm2Status) {
  switch (pm2Status) {
    case 'online': return S.RUNNING;
    case 'launching':
    case 'onepipe':
    case 'stopping': return S.STARTING;
    case 'errored': return S.ERRORED;
    case 'stopped':
    default: return S.STOPPED;
  }
}

const log = (msg) => console.log('[ServiceManager] ' + msg);

/* ---------------------------------------------------------------------------
 * Вызовы PM2 CLI
 * ------------------------------------------------------------------------- */

function runPm2(args) {
  return new Promise((resolve) => {
    const child = spawn('node', [PM2_BIN, ...args], { cwd: ROOT, windowsHide: true, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', (err) => resolve({ code: -1, stdout, stderr: stderr + '\n' + err.message }));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

// Извлекаем и парсим JSON из вывода `pm2 jlist` (устойчиво к приветственным строкам демона).
function parseJlist(stdout) {
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(stdout.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function fetchPm2List() {
  const res = await runPm2(['jlist']);
  if (res.code !== 0 && !res.stdout.includes('[')) {
    throw new Error('pm2 jlist завершился с кодом ' + res.code + ': ' + (res.stderr || res.stdout).trim());
  }
  const arr = parseJlist(res.stdout);
  const byName = new Map();
  for (const it of arr) {
    const name = it && it.name;
    if (name && NAMES.includes(name)) {
      byName.set(name, {
        pid: it.pid || 0,
        status: (it.pm2_env && it.pm2_env.status) || 'unknown',
        restarts: (it.pm2_env && it.pm2_env.restart_time) || 0,
        uptimeSince: (it.pm2_env && it.pm2_env.status === 'online' && it.pm2_env.uptime) ? it.pm2_env.uptime : null,
      });
    }
  }
  return byName;
}

/* ---------------------------------------------------------------------------
 * Действия (запуск/остановка/рестарт) — всегда через PM2
 * ------------------------------------------------------------------------- */

async function doStart(name) {
  const cur = cache.get(name);
  const state = cur ? cur.state : S.UNLOADED;
  if (state === S.RUNNING || state === S.STARTING) return { ok: true, noop: true };
  if (state === S.UNLOADED) {
    // Загрузить и запустить только это приложение из экосистемы.
    const r = await runPm2(['start', ECOSYSTEM, '--only', name]);
    return r.code === 0 ? { ok: true } : { ok: false, error: tail(r.stderr || r.stdout) };
  }
  // loaded, но stopped/errored → restart поднимает его.
  const r = await runPm2(['restart', name]);
  return r.code === 0 ? { ok: true } : { ok: false, error: tail(r.stderr || r.stdout) };
}

async function doStop(name) {
  const cur = cache.get(name);
  if (!cur || !cur.loaded) return { ok: true, noop: true };
  const r = await runPm2(['stop', name]);
  return r.code === 0 ? { ok: true } : { ok: false, error: tail(r.stderr || r.stdout) };
}

async function doRestart(name) {
  const r = await runPm2(['restart', name]);
  if (r.code === 0) return { ok: true };
  // Если приложение ещё не загружено в pm2 — стартуем из экосистемы.
  const r2 = await runPm2(['start', ECOSYSTEM, '--only', name]);
  return r2.code === 0 ? { ok: true } : { ok: false, error: tail(r2.stderr || r2.stdout) };
}

function tail(s) {
  const lines = String(s || '').split(/\r?\n/).filter(Boolean);
  return lines.slice(-3).join(' | ') || 'неизвестная ошибка pm2';
}

/* ---------------------------------------------------------------------------
 * Кэш состояний (обновляется фоном; HTTP отдаёт мгновенно из кэша)
 * ------------------------------------------------------------------------- */
const cache = new Map(); // name -> { ...meta, state, pm2Status, pid, restarts, uptimeSince, loaded, listening, canStart, canStop, canRestart }

function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(700);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

let lastError = null;
async function refreshSnapshot() {
  let byName = new Map();
  try {
    byName = await fetchPm2List();
    lastError = null;
  } catch (e) {
    lastError = e.message;
  }
  for (const meta of SERVICES) {
    const p = byName.get(meta.name);
    const loaded = !!p;
    const pm2Status = p ? p.status : null;
    const state = loaded ? mapStatus(pm2Status) : S.UNLOADED;
    const listening = meta.busOnly ? true : await probePort(meta.port);
    const canStart = state === S.STOPPED || state === S.UNLOADED || state === S.ERRORED;
    const canStop = state === S.RUNNING || state === S.STARTING;
    const canRestart = loaded && state !== S.STARTING;
    cache.set(meta.name, {
      ...meta,
      loaded, pm2Status, state,
      pid: p ? p.pid : 0,
      restarts: p ? p.restarts : 0,
      uptimeSince: p ? p.uptimeSince : null,
      listening, canStart, canStop, canRestart,
    });
  }
}
setInterval(() => { refreshSnapshot(); }, POLL_MS);

/* ---------------------------------------------------------------------------
 * Тэйлер логов: чтение файлов PM2 + стрим в браузер через SSE
 * ------------------------------------------------------------------------- */
// PM2 с time:true пишет префикс "YYYY-MM-DDTHH:mm:ss:"; поддержаем и вариант с пробелом.
const TS_PREFIX = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2}):?\s?([\s\S]*)$/;

async function statSize(p) {
  try { return (await fsp.stat(p)).size; } catch { return null; }
}

async function readFileRange(p, start, len) {
  if (len <= 0) return '';
  let fh;
  try {
    fh = await fsp.open(p, 'r');
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    return buf.toString('utf8');
  } catch {
    return '';
  } finally {
    if (fh) fh.close().catch(() => {});
  }
}

function makeEntry(text, stream) {
  const m = TS_PREFIX.exec(text);
  if (m) {
    const ts = Date.parse(m[1] + 'T' + m[2]);
    return { ts: Number.isFinite(ts) ? ts : Date.now(), stream, text: m[3] };
  }
  return { ts: Date.now(), stream, text };
}

async function readHistory(name) {
  const collect = async (file, stream) => {
    const size = await statSize(file);
    if (size == null || size === 0) return [];
    const bytes = Math.min(size, 256 * 1024);
    const start = size - bytes;
    const raw = await readFileRange(file, start, bytes);
    let lines = raw.split(/\r?\n/);
    if (start > 0) lines = lines.slice(1); // убираем обрезанный первый хвост
    lines = lines.filter((l) => l.length);
    return lines.map((l) => makeEntry(l, stream));
  };
  const [out, err] = await Promise.all([collect(OUT_LOG(name), 'stdout'), collect(ERR_LOG(name), 'stderr')]);
  const all = out.concat(err).sort((a, b) => a.ts - b.ts);
  return all.slice(-LOG_HISTORY_LINES);
}

class LogTailer {
  constructor(name) {
    this.name = name;
    this.clients = new Set();
    this.timer = null;
    this.pos = { [OUT_LOG(name)]: null, [ERR_LOG(name)]: null };
  }

  async subscribe(res) {
    const history = await readHistory(this.name);
    for (const e of history) res.write('event: log\ndata: ' + JSON.stringify(e) + '\n\n');
    res.write('event: init\ndata: ' + JSON.stringify({ name: this.name, total: history.length }) + '\n\n');
    this.clients.add(res);
    if (!this.timer) {
      // Ставим offset на текущий конец, чтобы history не задублилась в live.
      for (const f of Object.keys(this.pos)) this.pos[f] = await statSize(f);
      this.timer = setInterval(() => this.tick(), TAIL_MS);
    }
  }

  unsubscribe(res) {
    this.clients.delete(res);
    if (this.clients.size === 0) {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      for (const f of Object.keys(this.pos)) this.pos[f] = null;
    }
  }

  async tick() {
    for (const file of [OUT_LOG(this.name), ERR_LOG(this.name)]) {
      const stream = file.includes('.error.') ? 'stderr' : 'stdout';
      const size = await statSize(file);
      if (size == null) { this.pos[file] = null; continue; }
      if (this.pos[file] == null) { this.pos[file] = size; continue; }
      if (size < this.pos[file]) this.pos[file] = 0; // ротация/очистка
      if (size > this.pos[file]) {
        const chunk = await readFileRange(file, this.pos[file], size - this.pos[file]);
        this.pos[file] = size;
        for (const line of chunk.split(/\r?\n/)) {
          if (line.length) this.emit(makeEntry(line, stream));
        }
      }
    }
  }

  emit(entry) {
    const payload = 'event: log\ndata: ' + JSON.stringify(entry) + '\n\n';
    for (const res of this.clients) {
      try { res.write(payload); } catch { /* соединение закрывается */ }
    }
  }
}

const tailers = new Map();
function getTailer(name) {
  if (!tailers.has(name)) tailers.set(name, new LogTailer(name));
  return tailers.get(name);
}

/* ---------------------------------------------------------------------------
 * Шина RabbitMQ: топология (management HTTP API) + живой трафик (наблюдатель).
 *   • management API (:15672) — очереди, консьюмеры, ставки, binding'и (кто что
 *     объявляет/читает), connections, overview. Дёргается раз в BUS_POLL_MS.
 *   • наблюдатель — exclusive autoDelete-очередь, привязанная к topic exchange
 *     `events` паттерном `#`: получает КОПИЮ каждого маршрутизируемого сообщения
 *     (topic exchange доставляет в каждую подходящую очередь, поэтому сообщения
 *     НЕ перехватываются у сервисов). Поток идёт в браузер через SSE.
 * Внешних npm-зависимостей нет: amqplib подтягивается из workspace-хоистинга;
 * если он недоступен — наблюдатель молча деградирует, а топология всё равно
 * приходит по HTTP.
 * ------------------------------------------------------------------------- */
function loadEnvFile() {
  const out = {};
  try {
    const txt = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      out[m[1]] = v;
    }
  } catch { /* нет .env — не страшно */ }
  return out;
}
const FILE_ENV = loadEnvFile();
const envv = (k) => process.env[k] || FILE_ENV[k] || '';
const RABBITMQ_URL = envv('RABBITMQ_URL');

// Из amqp://user:pass@host:port выводим http-адрес management API и креды.
function deriveMgmt() {
  const port = envv('RABBITMQ_MGMT_PORT') || '15672';
  try {
    const u = new URL(/^amqp(s?):\/\//.test(RABBITMQ_URL) ? RABBITMQ_URL : 'amqp://' + RABBITMQ_URL);
    return {
      host: u.hostname || '127.0.0.1',
      port,
      user: decodeURIComponent(u.username || 'guest'),
      pass: decodeURIComponent(u.password || 'guest'),
    };
  } catch {
    return { host: '127.0.0.1', port, user: 'guest', pass: 'guest' };
  }
}
const MGMT = deriveMgmt();

function mgmtGet(pathname) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(MGMT.user + ':' + MGMT.pass).toString('base64');
    const req = http.get(
      { host: MGMT.host, port: MGMT.port, path: pathname, headers: { Authorization: 'Basic ' + auth, Accept: 'application/json' }, timeout: 5000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(res.statusCode + ' ' + res.statusMessage));
          try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('management API timeout')));
    req.on('error', reject);
  });
}

const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
const rateOf = (item, kind) => {
  const s = item && item.message_stats;
  const d = kind === 'publish' ? (s && s.publish_details) : (s && (s.deliver_get_details || s.deliver_details));
  return d && typeof d.rate === 'number' ? d.rate : 0;
};

// Кэш топологии шины (обновляется фоном; HTTP отдаёт мгновенно).
const BUS = { ok: false, error: null, updatedAt: 0, queues: [], exchanges: [], bindings: [], connections: [], overview: null };
async function refreshBus() {
  try {
    const [queues, exchanges, bindings, connections, overview] = await Promise.all([
      mgmtGet('/api/queues'),
      mgmtGet('/api/exchanges'),
      mgmtGet('/api/bindings'),
      mgmtGet('/api/connections'),
      mgmtGet('/api/overview'),
    ]);
    BUS.queues = queues || []; BUS.exchanges = exchanges || []; BUS.bindings = bindings || [];
    BUS.connections = connections || []; BUS.overview = overview || null;
    BUS.ok = true; BUS.error = null; BUS.updatedAt = Date.now();
  } catch (e) {
    BUS.ok = false; BUS.error = e.message;
  }
}

// Наблюдатель за живым трафиком `events`.
const OBS = { active: false, connected: false, queue: null, error: null, lastError: null };
let trafficPaused = false;
const traffic = [];
const TRAFFIC_RING = 400;
const trafficClients = new Set();

async function startObserver() {
  if (!RABBITMQ_URL) { OBS.error = 'RABBITMQ_URL не задан в .env'; return; }
  let amqplib;
  try {
    amqplib = await import('amqplib');
    if (amqplib && amqplib.default) amqplib = amqplib.default;
  } catch (e) {
    OBS.error = 'amqplib недоступен: ' + e.message;
    log('наблюдатель выключен: ' + OBS.error);
    return;
  }
  const loop = async () => {
    try {
      const conn = await amqplib.connect(RABBITMQ_URL);
      OBS.connected = true; OBS.error = null;
      const ch = await conn.createChannel();
      await ch.assertExchange('events', 'topic', { durable: true });
      const q = await ch.assertQueue('bus-observer', { exclusive: true, autoDelete: true });
      OBS.queue = q.queue;
      await ch.bindQueue(q.queue, 'events', '#'); // копия каждого маршрутизируемого сообщения
      await ch.consume(q.queue, (msg) => {
        if (!msg) return;
        try { ch.ack(msg); } catch { /* noop */ }
        if (trafficPaused) return;
        let preview = ''; let size = 0;
        try {
          size = msg.content ? msg.content.length : 0;
          preview = msg.content ? msg.content.toString('utf8').slice(0, 600) : '';
        } catch { /* noop */ }
        const p = msg.properties || {};
        const rec = {
          t: Date.now(),
          rk: msg.fields && msg.fields.routingKey,
          ex: msg.fields && msg.fields.exchange,
          size,
          preview,
          correlationId: p.correlationId || null,
          replyTo: p.replyTo || null,
        };
        traffic.push(rec);
        if (traffic.length > TRAFFIC_RING) traffic.splice(0, traffic.length - TRAFFIC_RING);
        const payload = 'event: msg\ndata: ' + JSON.stringify(rec) + '\n\n';
        for (const res of trafficClients) { try { res.write(payload); } catch { /* закрывается */ } }
      });
      OBS.active = true;
      log('наблюдатель за шиной активен (queue ' + q.queue + ' ← events.#)');
      conn.on('close', (err) => {
        OBS.active = false; OBS.connected = false;
        OBS.lastError = (err && err.message) || 'connection closed';
        setTimeout(loop, 4000);
      });
      conn.on('error', (e) => { OBS.lastError = e.message; });
    } catch (e) {
      OBS.connected = false; OBS.active = false; OBS.lastError = e.message; OBS.error = e.message;
      setTimeout(loop, 5000);
    }
  };
  loop();
}

/* ---------------------------------------------------------------------------
 * HTTP-роуты + встроенная веб-страница
 * ------------------------------------------------------------------------- */

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function servicesView() {
  return SERVICES.map((meta) => cache.get(meta.name)).filter(Boolean);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const parts = url.pathname.split('/').filter(Boolean);

  // GET / — HTML
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(INDEX_HTML);
  }

  // GET /api/services
  if (req.method === 'GET' && url.pathname === '/api/services') {
    return sendJson(res, 200, { services: servicesView(), pm2Error: lastError });
  }

  // GET /api/services/:name/logs/stream  (SSE)
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'services' && parts[3] === 'logs' && parts[4] === 'stream') {
    const name = parts[2];
    if (!NAMES.includes(name)) return sendJson(res, 404, { error: 'нет такого сервиса' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');
    const tailer = getTailer(name);
    await tailer.subscribe(res);
    const cleanup = () => tailer.unsubscribe(res);
    req.on('close', cleanup);
    res.on('error', cleanup);
    return;
  }

  // GET /api/services/:name/logs  (разовое чтение history)
  if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'services' && parts[3] === 'logs') {
    const name = parts[2];
    if (!NAMES.includes(name)) return sendJson(res, 404, { error: 'нет такого сервиса' });
    const history = await readHistory(name);
    return sendJson(res, 200, { service: name, lines: history });
  }

  // POST /api/start-all | /api/stop-all | /api/save
  if (req.method === 'POST' && (url.pathname === '/api/start-all' || url.pathname === '/api/stop-all' || url.pathname === '/api/save')) {
    if (url.pathname === '/api/save') {
      const r = await runPm2(['save']);
      return sendJson(res, 200, { ok: r.code === 0, saved: true });
    }
    const isStart = url.pathname === '/api/start-all';
    const results = [];
    for (const name of NAMES) {
      results.push({ name, ...(isStart ? await doStart(name) : await doStop(name)) });
      await new Promise((r) => setTimeout(r, 120));
    }
    await refreshSnapshot();
    return sendJson(res, 200, { results });
  }

  // POST /api/services/:name/:action  (start|stop|restart)
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'services' && parts[3]) {
    const name = parts[2];
    if (!NAMES.includes(name)) return sendJson(res, 404, { error: 'нет такого сервиса' });
    const action = parts[3];
    let out;
    if (action === 'start') out = await doStart(name);
    else if (action === 'stop') out = await doStop(name);
    else if (action === 'restart') out = await doRestart(name);
    else return sendJson(res, 400, { error: 'неизвестное действие: ' + action });
    await refreshSnapshot();
    return sendJson(res, 200, out);
  }

  // GET /api/bus — топология шины (очереди/связи/exchange/connections) + статус
  // наблюдателя + свежий срез трафика для первой отрисовки.
  if (req.method === 'GET' && url.pathname === '/api/bus') {
    const queues = BUS.queues.map((q) => ({
      name: q.name, vhost: q.vhost, consumers: num(q.consumers),
      messages: num(q.messages), messagesReady: num(q.messages_ready), messagesUnacked: num(q.messages_unacked),
      publishRate: rateOf(q, 'publish'), deliverRate: rateOf(q, 'deliver'),
      autoDelete: !!(q.auto_delete), observer: q.name === 'bus-observer',
    }));
    const exchanges = BUS.exchanges
      .filter((x) => x.name && x.name !== '')
      .map((x) => ({ name: x.name, type: x.type, publishRate: rateOf(x, 'publish') }));
    const bindings = BUS.bindings
      .filter((b) => b.source === 'events')
      .map((b) => ({ source: b.source, routingKey: b.routing_key, destination: b.destination, destinationType: b.destination_type }));
    const connections = BUS.connections.map((c) => ({
      name: c.name, user: c.user, hostName: c.hostName, client: (c.client_properties && c.client_properties.product) || c.client_properties && c.client_properties.platform || '',
      channels: num(c.channels), frameRate: (c.message_stats && c.message_stats.publish_details && c.message_stats.publish_details.rate) || 0,
    }));
    const ov = BUS.overview || {};
    return sendJson(res, 200, {
      ok: BUS.ok, error: BUS.error || OBS.lastError || null, updatedAt: BUS.updatedAt,
      mgmt: MGMT.host + ':' + MGMT.port,
      observer: { active: OBS.active, connected: OBS.connected, queue: OBS.queue, error: OBS.error, paused: trafficPaused },
      queueTotals: { queues: queues.length, consumers: queues.reduce((a, q) => a + q.consumers, 0) },
      overview: { version: ov.rabbitmq_version, node: ov.node, connections: num(ov.object_totals && ov.object_totals.connection && ov.object_totals.connection.objects), queues: num(ov.object_totals && ov.object_totals.queue && ov.object_totals.queue.objects), published: (ov.message_stats && ov.message_stats.publish_details && ov.message_stats.publish_details.rate) || 0, delivered: (ov.message_stats && ov.message_stats.deliver_get_details && ov.message_stats.deliver_get_details.rate) || 0 },
      queues, exchanges, bindings, connections,
      traffic: traffic.slice(-120),
    });
  }

  // GET /api/bus/traffic/stream — SSE живых сообщений шины.
  if (req.method === 'GET' && url.pathname === '/api/bus/traffic/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');
    res.write('event: init\ndata: ' + JSON.stringify({ recent: traffic.slice(-120), observer: OBS, paused: trafficPaused }) + '\n\n');
    trafficClients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* noop */ } }, 15000);
    const cleanup = () => { clearInterval(ping); trafficClients.delete(res); };
    req.on('close', cleanup);
    res.on('error', cleanup);
    return;
  }

  // POST /api/bus/traffic/pause {paused} | /api/bus/traffic/clear
  if (req.method === 'POST' && url.pathname === '/api/bus/traffic/pause') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { const j = JSON.parse(body || '{}'); if (typeof j.paused === 'boolean') trafficPaused = j.paused; } catch { trafficPaused = !trafficPaused; }
      return sendJson(res, 200, { paused: trafficPaused });
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/bus/traffic/clear') {
    traffic.length = 0;
    return sendJson(res, 200, { cleared: true });
  }

  sendJson(res, 404, { error: 'not found' });
});

// Закрытие морды НЕ трогает сервисы (они в PM2-демоне) — просто отключаемся.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { log('получен ' + sig + ' — закрываю веб-морду (сервисы PM2 остаются запущенными)'); process.exit(0); });
}

(async () => {
  await fsp.mkdir(LOG_DIR, { recursive: true });
  await refreshSnapshot();
  await refreshBus();
  setInterval(() => { refreshBus(); }, BUS_POLL_MS);
  startObserver();
  server.listen(MANAGER_PORT, () => {
    log('веб-морда (PM2-контроллер) доступна: http://aiternitas.local:' + MANAGER_PORT + '  и  http://localhost:' + MANAGER_PORT);
    log('PM2-бинарь: ' + PM2_BIN);
    log('шина: management API ' + MGMT.host + ':' + MGMT.port + ' · наблюдатель events.#');
  });
})();

/* ---------------------------------------------------------------------------
 * Встроенная HTML-страница (самодостаточная)
 * ------------------------------------------------------------------------- */
const PAGE_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Aiternitas · Service Manager (PM2)</title>
<style>
  :root{--bg:#0d1117;--panel:#161b22;--panel2:#1c2330;--line:#30363d;--txt:#e6edf3;--dim:#8b949e;--accent:#58a6ff;--green:#3fb950;--red:#f85149;--yellow:#d29922;--gray:#6e7681}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--txt);font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
  header{display:flex;align-items:center;gap:16px;padding:16px 22px;border-bottom:1px solid var(--line);background:var(--panel);position:sticky;top:0;z-index:10}
  header h1{font-size:18px;margin:0;font-weight:600}
  header .sub{color:var(--dim);font-size:12px}
  .spacer{flex:1}
  .conn{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dim)}
  .conn .d{width:9px;height:9px;border-radius:50%;background:var(--gray)}
  .conn.ok .d{background:var(--green)}
  .conn.bad .d{background:var(--red)}
  .wrap{padding:22px;max-width:1200px;margin:0 auto}
  .toolbar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
  .banner{background:#3a1d1d;border:1px solid #5c2b2b;color:#ffb4a8;padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:13px;display:none}
  button{cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--txt);padding:7px 13px;border-radius:8px;font-size:13px;transition:.15s}
  button:hover:not(:disabled){border-color:var(--accent);background:#22304a}
  button:disabled{opacity:.4;cursor:not-allowed}
  button.primary{border-color:#2a4d7a;background:#1b3a5f}
  button.danger{border-color:#5c2b2b}
  button.ghost{background:transparent}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:10px;transition:.15s}
  .card:hover{border-color:#3d4650;transform:translateY(-1px)}
  .card .top{display:flex;align-items:flex-start;gap:10px}
  .card .ttl{font-weight:600;font-size:15px}
  .card .role{color:var(--dim);font-size:12px;margin-top:2px}
  .dot{width:11px;height:11px;border-radius:50%;flex-shrink:0;margin-top:4px;background:var(--gray)}
  .dot.running{background:var(--green);box-shadow:0 0 8px var(--green)}
  .dot.starting{background:var(--yellow);animation:pulse 1s infinite}
  .dot.stopping{background:var(--yellow);animation:pulse 1s infinite}
  .dot.stopped{background:var(--gray)}
  .dot.unloaded{background:#3d4650}
  .dot.errored{background:var(--red);box-shadow:0 0 8px var(--red)}
  @keyframes pulse{50%{opacity:.35}}
  .meta{display:flex;gap:12px 16px;font-size:12px;color:var(--dim);flex-wrap:wrap}
  .meta b{color:var(--txt);font-weight:500}
  .st{font-size:12px;font-weight:600}
  .st.running{color:var(--green)}.st.stopped,.st.unloaded{color:var(--dim)}.st.starting{color:var(--yellow)}.st.errored{color:var(--red)}
  .actions{display:flex;gap:8px;margin-top:4px}
  .actions .grow{flex:1}
  .overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:20}
  .overlay.open{display:block}
  .panel{position:fixed;top:0;right:0;height:100%;width:min(920px,95vw);background:var(--bg);border-left:1px solid var(--line);display:none;flex-direction:column;z-index:21;box-shadow:-10px 0 40px rgba(0,0,0,.5)}
  .panel.open{display:flex}
  .panel .ph{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--line);background:var(--panel)}
  .panel .ph .name{font-weight:600;font-size:15px}
  .panel .ph .badge{font-size:11px;padding:2px 8px;border-radius:20px;border:1px solid var(--line);color:var(--dim)}
  .panel .ctrl{display:flex;align-items:center;gap:10px;padding:8px 18px;border-bottom:1px solid var(--line);font-size:12px;color:var(--dim);background:var(--panel2)}
  .logs{flex:1;overflow:auto;padding:12px 16px;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;word-break:break-word}
  .logs .ln{display:flex;gap:10px;padding:1px 0;border-bottom:1px solid rgba(255,255,255,.02)}
  .logs .ts{color:var(--gray);flex-shrink:0}
  .logs .body{flex:1}
  .logs .stderr .body{color:#ffb4a8}
  .logs .system .body{color:var(--yellow);font-style:italic}
  .empty{color:var(--dim);padding:30px;text-align:center;font-style:italic}
  .tabs{display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid var(--line)}
  .tab{background:transparent;border:1px solid transparent;border-bottom:none;color:var(--dim);padding:9px 16px;border-radius:8px 8px 0 0;font-size:13px;font-weight:600}
  .tab:hover{color:var(--txt)}
  .tab.active{color:var(--txt);background:var(--panel);border-color:var(--line);border-bottom-color:var(--panel);margin-bottom:-1px}
  .arch-toolbar{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--dim);margin-bottom:12px}
  .arch-toolbar .pill{display:inline-flex;align-items:center;gap:6px;background:var(--panel);border:1px solid var(--line);padding:5px 11px;border-radius:20px}
  .arch-toolbar .pill b{color:var(--txt);font-weight:600}
  .lg{display:inline-flex;align-items:center;gap:5px}
  .lg .sw{width:12px;height:12px;border-radius:3px;display:inline-block}
  .arch-graph{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:10px;overflow:auto}
  .arch-graph svg{width:100%;height:auto;display:block;min-width:900px}
  .arch-panels{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
  .apanel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;min-width:0}
  .apanel.wide{grid-column:1 / -1}
  .apanel h3{margin:0 0 10px;font-size:14px;font-weight:600}
  table.bus{width:100%;border-collapse:collapse;font-size:12px}
  table.bus th{text-align:left;color:var(--dim);font-weight:500;padding:5px 8px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel)}
  table.bus td{padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.04)}
  table.bus tr:hover td{background:var(--panel2)}
  .rk{font-family:ui-monospace,Consolas,monospace}
  .num{text-align:right;font-variant-numeric:tabular-nums}
  .scroll{max-height:320px;overflow:auto}
  .traffic{max-height:360px;overflow:auto;font:12px/1.5 ui-monospace,Consolas,monospace;border:1px solid var(--line);border-radius:8px;background:#0b0f14}
  .tr{display:flex;gap:10px;padding:3px 10px;border-bottom:1px solid rgba(255,255,255,.04);align-items:baseline}
  .tr .tt{color:var(--gray);flex-shrink:0}
  .tr .key{flex-shrink:0;font-weight:600}
  .tr .sz{color:var(--dim);flex-shrink:0;width:66px;text-align:right}
  .tr .pv{color:var(--dim);flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .tr.cmd .key{color:var(--accent)}
  .tr.reply .key{color:#7ee787}
  .tr.push .key{color:var(--yellow)}
  .tr.rpc .key{color:#c9a6ff}
  .tr.ov .key{color:var(--dim)}
  .ctrl-row{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap}
  .ctrl-row input[type=text]{flex:1;min-width:160px;background:var(--panel2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:6px 10px;font-size:12px}
</style>
</head>
<body>
<header>
  <div>
    <h1>Aiternitas · Service Manager</h1>
    <div class="sub">управление через PM2 · запуск / остановка / логи в реальном времени</div>
  </div>
  <div class="spacer"></div>
  <div class="conn" id="conn"><span class="d"></span><span id="connTxt">подключение…</span></div>
</header>

<div class="wrap">
  <div class="banner" id="banner"></div>
  <div class="tabs">
    <button class="tab active" id="tabServices" data-view="services">🧩 Сервисы</button>
    <button class="tab" id="tabArch" data-view="arch">🕸 Архитектура · Шина</button>
  </div>

  <div id="viewServices">
    <div class="toolbar">
      <button class="primary" id="startAll">▶ Запустить все</button>
      <button class="danger" id="stopAll">■ Остановить все</button>
      <button class="ghost" id="saveBtn">💾 pm2 save</button>
      <button class="ghost" id="refresh">↻ Обновить</button>
    </div>
    <div class="grid" id="grid"><div class="empty">Загрузка сервисов…</div></div>
  </div>

  <div id="viewArch" style="display:none">
    <div class="arch-toolbar" id="archMeta"></div>
    <div class="arch-graph" id="archGraph"><div class="empty">Загрузка архитектуры…</div></div>
    <div class="arch-panels">
      <div class="apanel">
        <h3>Очереди шины <span class="sub" id="qCount"></span></h3>
        <div class="scroll" id="queuesTable"></div>
      </div>
      <div class="apanel">
        <h3>Связи exchange <span class="rk">events</span> → очереди</h3>
        <div class="scroll" id="bindingsTable"></div>
      </div>
      <div class="apanel wide">
        <h3>Живой трафик шины <span class="sub">копии всех сообщений exchange <span class="rk">events</span> (наблюдатель events.#)</span></h3>
        <div class="ctrl-row">
          <button class="ghost" id="trafficPause">⏸ Пауза</button>
          <button class="ghost" id="trafficClear">✕ Очистить</button>
          <label class="lg"><input type="checkbox" id="trafficFollow" checked> автопрокрутка</label>
          <input type="text" id="trafficFilter" placeholder="фильтр по routing key (напр. flowchart, reply., push.)"/>
        </div>
        <div class="traffic" id="traffic"><div class="empty">Ожидание сообщений…</div></div>
      </div>
    </div>
  </div>
</div>

<div class="overlay" id="overlay"></div>
<section class="panel" id="panel">
  <div class="ph">
    <span class="dot" id="pDot"></span>
    <span class="name" id="pName">Логи</span>
    <span class="badge" id="pBadge"></span>
    <div class="spacer"></div>
    <button class="ghost" id="pClose">✕ Закрыть</button>
  </div>
  <div class="ctrl">
    <label><input type="checkbox" id="follow" checked> автопрокрутка</label>
    <span class="spacer"></span>
    <button class="ghost" id="clearLogs">Очистить экран</button>
  </div>
  <div class="logs" id="logs"></div>
</section>

<script>
(function(){
  var services = [];
  var grid = document.getElementById('grid');
  var conn = document.getElementById('conn');
  var connTxt = document.getElementById('connTxt');
  var banner = document.getElementById('banner');
  var panel = document.getElementById('panel');
  var overlay = document.getElementById('overlay');
  var logsEl = document.getElementById('logs');
  var followEl = document.getElementById('follow');
  var currentSvc = null;
  var eventSource = null;

  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
  function pad(n){ return (n<10?'0':'')+n; }
  function fmtTs(ts){ var d=new Date(ts); return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }
  function human(ms){ var s=Math.floor(ms/1000); if(s<60)return s+'s'; var m=Math.floor(s/60); if(m<60)return m+'m '+(s%60)+'s'; var h=Math.floor(m/60); return h+'h '+(m%60)+'m'; }

  function statusOf(svc){
    var cls = svc.state;
    var label = (LABEL[svc.state]||svc.state);
    if (svc.busOnly && svc.state==='running') label = 'работает · шина (без порта)';
    else if (svc.state==='running' && !svc.listening) label = 'работает (порт не слушает)';
    if (!svc.busOnly && svc.state==='stopped' && svc.listening) label = 'остановлен · порт занят извне';
    return {cls:cls, label:label};
  }
  var LABEL = { unloaded:'не загружен', stopped:'остановлен', starting:'запуск…', running:'работает', errored:'ошибка' };

  function render(){
    grid.innerHTML='';
    services.forEach(function(svc){
      var st = statusOf(svc);
      var card = document.createElement('div');
      card.className='card';
      var pid = svc.pid ? ('pid '+svc.pid) : '—';
      var up = (svc.state==='running' && svc.uptimeSince) ? human(Date.now()-svc.uptimeSince) : '—';
      var rst = (svc.restarts||0);
      card.innerHTML =
        '<div class="top">'+
          '<span class="dot '+st.cls+'"></span>'+
          '<div><div class="ttl">'+esc(svc.title)+'</div><div class="role">'+esc(svc.role)+'</div></div>'+
        '</div>'+
        '<div class="meta">'+
          '<span>порт <b>'+(svc.busOnly?'шина':svc.port)+'</b></span>'+
          '<span>статус PM2 <b class="st '+st.cls+'">'+esc(st.label)+'</b></span>'+
          '<span>pid <b>'+esc(pid)+'</b></span>'+
          '<span>аптайм <b>'+esc(up)+'</b></span>'+
          '<span>рестартов <b>'+rst+'</b></span>'+
        '</div>'+
        '<div class="actions">'+
          '<button data-act="start" '+(!svc.canStart?'disabled':'')+'>▶ Старт</button>'+
          '<button data-act="stop" class="danger" '+(!svc.canStop?'disabled':'')+'>■ Стоп</button>'+
          '<button data-act="restart" '+(!svc.canRestart?'disabled':'')+'>↻ Рестарт</button>'+
          '<div class="grow"></div>'+
          '<button data-open="1">Логи →</button>'+
        '</div>';
      card.querySelectorAll('button[data-act]').forEach(function(b){
        b.addEventListener('click', function(){ doAction(svc.name, b.getAttribute('data-act')); });
      });
      card.querySelector('button[data-open]').addEventListener('click', function(){ openLogs(svc.name); });
      grid.appendChild(card);
    });
  }

  function setConn(ok){ conn.className='conn '+(ok?'ok':'bad'); connTxt.textContent = ok?'онлайн':'морда недоступна'; }

  function refresh(){
    fetch('/api/services').then(function(r){ return r.json(); }).then(function(d){
      services = d.services || [];
      setConn(true);
      if (d.pm2Error){ banner.style.display='block'; banner.textContent='PM2: '+d.pm2Error; }
      else { banner.style.display='none'; }
      render();
      if (currentSvc){
        var s = services.filter(function(x){return x.name===currentSvc;})[0];
        if (s){ var st=statusOf(s); document.getElementById('pDot').className='dot '+st.cls; document.getElementById('pBadge').textContent=st.label; }
      }
    }).catch(function(){ setConn(false); });
  }

  function doAction(name, act){
    fetch('/api/services/'+name+'/'+act, {method:'POST'}).then(function(r){return r.json();}).then(function(res){
      if (res && res.ok===false && res.error){ toast(res.error); }
      refresh();
    }).catch(function(){ refresh(); });
  }

  function appendLog(entry){
    var line = document.createElement('div');
    line.className='ln '+(entry.stream||'stdout');
    line.innerHTML = '<span class="ts">'+fmtTs(entry.ts)+'</span><span class="body">'+esc(entry.text)+'</span>';
    logsEl.appendChild(line);
    while (logsEl.childNodes.length > 3000) logsEl.removeChild(logsEl.firstChild);
    if (followEl.checked) logsEl.scrollTop = logsEl.scrollHeight;
  }

  function sysNote(text){
    var line=document.createElement('div');
    line.className='ln system';
    line.innerHTML='<span class="ts">--:--:--</span><span class="body">'+esc(text)+'</span>';
    logsEl.appendChild(line);
    if (followEl.checked) logsEl.scrollTop=logsEl.scrollHeight;
  }

  function openLogs(name){
    var svc = services.filter(function(x){return x.name===name;})[0];
    currentSvc = name;
    logsEl.innerHTML='';
    document.getElementById('pName').textContent = (svc?svc.title:name)+' · логи';
    panel.classList.add('open'); overlay.classList.add('open');
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/services/'+name+'/logs/stream');
    eventSource.addEventListener('log', function(e){ appendLog(JSON.parse(e.data)); });
    eventSource.addEventListener('init', function(e){
      var d=JSON.parse(e.data);
      var s = services.filter(function(x){return x.name===name;})[0];
      if (s){ var st=statusOf(s); document.getElementById('pDot').className='dot '+st.cls; document.getElementById('pBadge').textContent=st.label; }
      if (d.total===0) sysNote('Пока пусто. Логи PM2 пишутся в logs/'+name+'.out.log и logs/'+name+'.error.log — запустите сервис, чтобы они появились.');
    });
    eventSource.onerror = function(){ /* браузер переподключится сам */ };
  }

  function closeLogs(){
    panel.classList.remove('open'); overlay.classList.remove('open');
    if (eventSource){ eventSource.close(); eventSource=null; }
    currentSvc=null;
  }

  var toastT=null;
  function toast(msg){
    var el=document.getElementById('toast');
    if(!el){ el=document.createElement('div'); el.id='toast'; el.style.cssText='position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b3a5f;border:1px solid #2a4d7a;padding:10px 16px;border-radius:8px;z-index:40'; document.body.appendChild(el);}
    el.textContent=msg; el.style.display='block';
    clearTimeout(toastT); toastT=setTimeout(function(){el.style.display='none';},3800);
  }

  document.getElementById('pClose').addEventListener('click', closeLogs);
  document.getElementById('overlay').addEventListener('click', closeLogs);
  document.getElementById('clearLogs').addEventListener('click', function(){ logsEl.innerHTML=''; });
  document.getElementById('refresh').addEventListener('click', refresh);
  document.getElementById('startAll').addEventListener('click', function(){ toast('Запускаю все сервисы через PM2…'); fetch('/api/start-all',{method:'POST'}).then(function(){ setTimeout(refresh,600); }); });
  document.getElementById('stopAll').addEventListener('click', function(){ if(confirm('Остановить ВСЕ сервисы (pm2 stop)?')) { toast('Останавливаю…'); fetch('/api/stop-all',{method:'POST'}).then(function(){ setTimeout(refresh,600); }); } });
  document.getElementById('saveBtn').addEventListener('click', function(){ fetch('/api/save',{method:'POST'}).then(function(r){return r.json();}).then(function(d){ toast(d.ok?'Набор PM2 сохранён (pm2 save)':'Не удалось сохранить'); }); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeLogs(); });

  /* =====================================================================
   * АРХИТЕКТУРА · ШИНА
   * ===================================================================== */
  var viewArch=document.getElementById('viewArch');
  var viewServices=document.getElementById('viewServices');
  var tabArch=document.getElementById('tabArch');
  var tabServices=document.getElementById('tabServices');
  var archMeta=document.getElementById('archMeta');
  var archGraph=document.getElementById('archGraph');
  var trafficEl=document.getElementById('traffic');
  var busData=null, busTimer=null, busES=null, currentView='services';
  var trafficFollowEl=document.getElementById('trafficFollow');
  var trafficFilterEl=document.getElementById('trafficFilter');
  var trafficPaused=false, trafficStarted=false;

  var COL={ running:'#3fb950', errored:'#f85149', starting:'#d29922', stopped:'#6e7681', unloaded:'#3d4650' };
  function svcByName(name){ for(var i=0;i<services.length;i++){ if(services[i].name===name) return services[i]; } return null; }
  function stateColor(name){ var s=svcByName(name); return COL[s?s.state:'unloaded']||COL.unloaded; }
  function qfmt(n){ n=n||0; return n>=10?String(Math.round(n)):n.toFixed(1); }
  function hhmmss(ts){ var d=new Date(ts); return pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }

  // Фиксированная раскладка графа: 5 ярусов (edge → gateway → шина → сервисы → инфраструктура/очереди).
  var NODES=[
    {id:'browser', x:20,  y:40,  w:150,h:52, kind:'ext',  title:'Браузер',        sub:'UI клиента'},
    {id:'client',  x:210, y:40,  w:150,h:52, kind:'svc',  svc:'client',          title:'Client · Vite',   sub:':3000'},
    {id:'socket',  x:410, y:40,  w:190,h:52, kind:'svc',  svc:'socket', queue:'socket_service', title:'SocketGate', sub:':4009 · мост в шину'},
    {id:'integration', x:640,y:40,w:180,h:52,kind:'svc',  svc:'integration', queue:'integration_service', title:'Integration', sub:':4007'},
    {id:'gateway', x:210, y:150, w:150,h:52, kind:'svc',  svc:'gateway',         title:'API Gateway',     sub:':3001'},
    {id:'bus',     x:380, y:300, w:380,h:120,kind:'bus',  title:'шина · exchange \"events\"', sub:'topic · RabbitMQ :5672'},
    {id:'user',    x:120, y:520, w:160,h:66, kind:'svc',  svc:'user', queue:'user_service', title:'UserServer', sub:':4002 · auth/flow/task/sandbox'},
    {id:'ai',      x:320, y:520, w:140,h:66, kind:'svc',  svc:'ai', queue:'ai_service', title:'AiServer', sub:'Ollama LLM · без порта'},
    {id:'dep',     x:500, y:520, w:140,h:66, kind:'svc',  svc:'dep', queue:'dep_service', title:'DepServer', sub:'оркестратор · без порта'},
    {id:'worker',  x:680, y:520, w:150,h:66, kind:'svc',  svc:'worker', queue:'worker_service', title:'WorkerServer', sub:'воркеры · без порта'},
    {id:'sandbox', x:870, y:520, w:160,h:66, kind:'svc',  svc:'sandbox', queue:'sandbox_service', title:'SandboxServer', sub:'исполнение · без порта'},
    {id:'postgres',x:120, y:680, w:160,h:50, kind:'infra', title:'PostgreSQL',   sub:':5432'},
    {id:'redis',   x:320, y:680, w:140,h:50, kind:'infra', title:'Redis',        sub:':6379'},
    {id:'ollama',  x:500, y:680, w:150,h:50, kind:'infra', title:'Ollama',       sub:':11434'},
    {id:'tasksq',  x:690, y:680, w:160,h:50, kind:'queue', queue:'tasks_queue',  title:'tasks_queue', sub:'work-queue (dep→worker)'}
  ];
  var EDGES=[
    ['browser','client'],['client','gateway'],['client','socket'],
    ['gateway','user'],['gateway','integration'],
    ['socket','bus'],['integration','bus'],
    ['user','bus'],['ai','bus'],['dep','bus'],['worker','bus'],['sandbox','bus'],
    ['dep','tasksq'],['tasksq','worker'],
    ['user','postgres'],['dep','postgres'],['worker','postgres'],['sandbox','postgres'],
    ['user','redis'],['ai','ollama']
  ];
  var byId={}; NODES.forEach(function(n){ byId[n.id]=n; });

  function queueMap(){ var m={}; if(busData&&busData.queues) busData.queues.forEach(function(q){ m[q.name]=q; }); return m; }

  function nodeSvg(n,qm){
    var fill='#1c2330', stroke='#30363d';
    if(n.kind==='bus'){ fill='#0f2a44'; stroke='#2a4d7a'; }
    else if(n.kind==='queue'){ fill='#241f10'; stroke='#8a6d1a'; }
    else if(n.kind==='infra'){ fill='#11161d'; stroke='#3d4650'; }
    else if(n.kind==='ext'){ fill='#0d1117'; stroke='#30363d'; }
    var cx=n.x+n.w/2;
    var s='<g>';
    s+='<rect x="'+n.x+'" y="'+n.y+'" width="'+n.w+'" height="'+n.h+'" rx="10" fill="'+fill+'" stroke="'+stroke+'" stroke-width="1.5"/>';
    s+='<text x="'+cx+'" y="'+(n.y+(n.kind==='bus'?34:22))+'" fill="#e6edf3" font-size="13" font-weight="600" text-anchor="middle">'+esc(n.title)+'</text>';
    s+='<text x="'+cx+'" y="'+(n.y+(n.kind==='bus'?54:40))+'" fill="#8b949e" font-size="11" text-anchor="middle">'+esc(n.sub)+'</text>';
    if(n.svc){ s+='<circle cx="'+(n.x+n.w-13)+'" cy="'+(n.y+13)+'" r="6" fill="'+stateColor(n.svc)+'"/>'; }
    var q=n.queue?qm[n.queue]:null;
    if(q){
      var yy=n.y+n.h-10;
      var txt='\u2191'+qfmt(q.publishRate)+' \u2193'+qfmt(q.deliverRate)+' \u00d7'+q.consumers+(q.messages?('  \u25a8'+q.messages):'');
      s+='<rect x="'+(n.x+6)+'" y="'+(n.y+n.h-26)+'" width="'+(n.w-12)+'" height="18" rx="6" fill="#0b0f14" stroke="#222a35"/>';
      s+='<text x="'+cx+'" y="'+yy+'" fill="#7ee787" font-size="11" text-anchor="middle">'+esc(txt)+'</text>';
    }
    if(n.kind==='bus' && busData && busData.overview){
      var o=busData.overview;
      s+='<text x="'+cx+'" y="'+(n.y+n.h-30)+'" fill="#58a6ff" font-size="12" text-anchor="middle">\u2191 '+qfmt(o.published)+'/s   \u2193 '+qfmt(o.delivered)+'/s</text>';
      s+='<text x="'+cx+'" y="'+(n.y+n.h-12)+'" fill="#8b949e" font-size="11" text-anchor="middle">'+ (busData.ok?('RMQ '+esc(o.version||'')+' \u00b7 соединений '+(o.connections||0)):'management API недоступен') +'</text>';
    }
    s+='</g>';
    return s;
  }

  function renderGraph(){
    var qm=queueMap();
    var lines=EDGES.map(function(e){
      var a=byId[e[0]], b=byId[e[1]]; if(!a||!b) return '';
      var ax=a.x+a.w/2, ay=a.y+a.h/2, bx=b.x+b.w/2, by=b.y+b.h/2;
      return '<line x1="'+ax+'" y1="'+ay+'" x2="'+bx+'" y2="'+by+'" stroke="#2b333d" stroke-width="1.4"/>';
    }).join('');
    var rects=NODES.map(function(n){ return nodeSvg(n,qm); }).join('');
    archGraph.innerHTML='<svg viewBox="0 0 1080 760" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">'+lines+rects+'</svg>';
  }

  function renderQueues(){
    var el=document.getElementById('queuesTable');
    if(!busData){ el.innerHTML=''; return; }
    var qs=busData.queues.slice().sort(function(a,b){ return a.name.localeCompare(b.name); });
    var rows=qs.map(function(q){
      return '<tr><td class="rk">'+esc(q.name)+(q.observer?' <span class="sub">· наблюдатель</span>':'')+'</td><td class="num">'+q.consumers+'</td><td class="num">'+q.messages+'</td><td class="num">'+qfmt(q.publishRate)+'</td><td class="num">'+qfmt(q.deliverRate)+'</td></tr>';
    }).join('');
    el.innerHTML='<table class="bus"><thead><tr><th>очередь</th><th class="num">cons</th><th class="num">msgs</th><th class="num">\u2191/s</th><th class="num">\u2193/s</th></tr></thead><tbody>'+rows+'</tbody></table>';
    document.getElementById('qCount').textContent = busData.queueTotals? ('\u00b7 '+busData.queueTotals.queues+' очередей \u00b7 '+busData.queueTotals.consumers+' консьюмеров') : '';
  }

  function renderBindings(){
    var el=document.getElementById('bindingsTable');
    if(!busData){ el.innerHTML=''; return; }
    var bs=busData.bindings.slice().sort(function(a,b){ return (a.destination+ a.routingKey).localeCompare(b.destination+b.routingKey); });
    var rows=bs.map(function(b){
      return '<tr><td class="rk">'+esc(b.routingKey||'(default)')+'</td><td class="rk">\u2192 '+esc(b.destination)+'</td></tr>';
    }).join('');
    el.innerHTML='<table class="bus"><thead><tr><th>routing key (паттерн)</th><th>очередь</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }

  function renderMeta(){
    if(!busData){ archMeta.innerHTML=''; return; }
    var obs=busData.observer||{};
    var busOk=busData.ok;
    var pills='';
    pills+='<span class="pill">шина: '+(busOk?'<b style="color:#3fb950">management OK</b>':'<b style="color:#f85149">нет связи</b>')+' <span class="sub">'+esc(busData.mgmt||'')+'</span></span>';
    pills+='<span class="pill">RMQ <b>'+esc((busData.overview&&busData.overview.version)||'—')+'</b></span>';
    pills+='<span class="pill">наблюдатель: '+(obs.active?'<b style="color:#3fb950">активен</b>':(obs.error?'<b style="color:#f85149">ошибка</b>':'<b style="color:#d29922">подключение\u2026</b>'))+'</span>';
    if(obs.error) pills+='<span class="pill sub">'+esc(obs.error)+'</span>';
    var lg='<span class="pill">легенда: '+
      '<span class="lg"><span class="sw" style="background:#3fb950"></span>работает</span> '+
      '<span class="lg"><span class="sw" style="background:#d29922"></span>запуск</span> '+
      '<span class="lg"><span class="sw" style="background:#f85149"></span>ошибка</span> '+
      '<span class="lg"><span class="sw" style="background:#6e7681"></span>остановлен</span> '+
      '<span class="lg"><span class="sw" style="background:#2a4d7a"></span>шина</span> '+
      '<span class="lg"><span class="sw" style="background:#8a6d1a"></span>очередь задач</span></span>';
    archMeta.innerHTML=pills+lg;
  }

  function fetchBus(){
    fetch('/api/bus').then(function(r){ return r.json(); }).then(function(d){
      busData=d; renderMeta(); renderGraph(); renderQueues(); renderBindings();
    }).catch(function(){});
  }

  // --- консоль живого трафика ---
  function classify(rk){
    if(!rk) return 'ov';
    if(rk.indexOf('reply.')===0) return 'reply';
    if(rk.indexOf('push.')===0) return 'push';
    return 'cmd';
  }
  function trafficOk(rk){
    var f=(trafficFilterEl.value||'').trim();
    if(!f) return true;
    return String(rk||'').indexOf(f)!==-1;
  }
  function addTrafficRow(rec){
    if(!trafficOk(rec.rk)) return;
    var empty=trafficEl.querySelector('.empty'); if(empty) empty.remove();
    var pv=String(rec.preview||'').replace(/\s+/g,' ');
    var row=document.createElement('div');
    row.className='tr '+classify(rec.rk);
    row.innerHTML='<span class="tt">'+hhmmss(rec.t)+'</span><span class="key">'+esc(rec.rk||'(default)')+'</span><span class="sz">'+(rec.size||0)+' B</span><span class="pv">'+esc(pv)+'</span>';
    trafficEl.appendChild(row);
    while(trafficEl.childNodes.length>600) trafficEl.removeChild(trafficEl.firstChild);
    if(trafficFollowEl.checked) trafficEl.scrollTop=trafficEl.scrollHeight;
  }
  function seedTraffic(list){
    trafficEl.innerHTML='';
    if(!list||!list.length){ trafficEl.innerHTML='<div class="empty">Пока тихо. Наблюдатель ловит копии всех сообщений шины в реальном времени.</div>'; return; }
    list.forEach(addTrafficRow);
  }
  function openTraffic(){
    if(busES) return;
    busES=new EventSource('/api/bus/traffic/stream');
    busES.addEventListener('init', function(e){
      var d=JSON.parse(e.data); trafficPaused=d.paused; trafficStarted=true;
      updatePauseBtn(); seedTraffic(d.recent);
    });
    busES.addEventListener('msg', function(e){ addTrafficRow(JSON.parse(e.data)); });
    busES.onerror=function(){};
  }
  function closeTraffic(){ if(busES){ busES.close(); busES=null; } }
  function updatePauseBtn(){
    var b=document.getElementById('trafficPause');
    if(b) b.textContent=trafficPaused?'\u25b6 Продолжить':'\u23f8 Пауза';
  }

  function switchView(v){
    currentView=v;
    tabServices.className='tab'+(v==='services'?' active':'');
    tabArch.className='tab'+(v==='arch'?' active':'');
    viewServices.style.display=v==='services'?'':'none';
    viewArch.style.display=v==='arch'?'':'none';
    if(v==='arch'){
      if(!busTimer){ fetchBus(); busTimer=setInterval(fetchBus, 2500); }
      openTraffic();
    } else {
      if(busTimer){ clearInterval(busTimer); busTimer=null; }
      closeTraffic();
    }
  }

  tabServices.addEventListener('click', function(){ switchView('services'); });
  tabArch.addEventListener('click', function(){ switchView('arch'); });
  document.getElementById('trafficClear').addEventListener('click', function(){ fetch('/api/bus/traffic/clear',{method:'POST'}).then(function(){ trafficEl.innerHTML='<div class="empty">Очищено.</div>'; }); });
  document.getElementById('trafficPause').addEventListener('click', function(){ fetch('/api/bus/traffic/pause',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paused:!trafficPaused})}).then(function(r){return r.json();}).then(function(d){ trafficPaused=d.paused; updatePauseBtn(); }); });
  trafficFilterEl.addEventListener('input', function(){ if(busData&&busData.traffic) seedTraffic(busData.traffic); });

  refresh();
  setInterval(refresh, 2000);
})();
</script>
</body>
</html>`;

const INDEX_HTML = '<!doctype html>\n' + PAGE_HTML;
