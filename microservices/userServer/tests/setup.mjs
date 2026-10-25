// Vitest setup: загружает корневой .env через config.mjs, чтобы тесты,
// работающие с БД (auth-routes/auth-session), получили корректные креды.
import '../config.mjs';
