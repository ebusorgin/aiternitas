# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Aiternitas is a full-stack business management platform (Node.js/Express backend + React/Vite frontend) with PostgreSQL for storage. The interface is in Russian.

### Required services

| Service | Port | Start command |
|---------|------|---------------|
| PostgreSQL | 5432 | `sudo pg_ctlcluster 16 main start` |
| Backend (Express + Socket.IO + SMTP receiver) | 3001 | `node server.mjs` (from repo root) |
| Frontend (Vite dev server) | 3000 | `npm run dev` (from repo root) |

### Critical environment notes

- **`NODE_ENV=development` is mandatory on Linux.** The server auto-detects Linux as production (see `server.mjs` `isProduction` logic), which sets `secure: true` on cookies, breaking local non-HTTPS auth. Always set `NODE_ENV=development` in `.env`.
- **PostgreSQL user needs TCP password auth.** The app connects via TCP (`127.0.0.1`), not Unix sockets, so `peer` auth is insufficient. Set a password for your DB user and configure `DB_PASSWORD` in `.env`.
- The `.env` file at repo root is loaded by `dotenv` at startup. See `scripts/env.production.example` for all variables.
- The `uploads/` directory must exist at the repo root for file upload features.

### Build / lint / test

- **Build:** `npm run build` — Vite production build to `dist/`.
- **Lint:** `npm run lint` — ESLint 9 flat config covering `src/` (React) and `server/` (Node.js). `npm run lint:fix` to auto-fix.
- **Tests:** `npm test` — Vitest. Tests live in `tests/backend/` (node env) and `tests/frontend/` (jsdom env). `npm run test:watch` for watch mode.
- **Dev:** `npm run dev` starts Vite on port 3000 with proxy to backend on port 3001.

### Socket.IO in development

The Vite dev server only proxies `/api` to the backend. Socket.IO connections use `window.location.origin` (port 3000), but the Vite proxy config does not cover `/socket.io/`. Real-time features (flowchart collaboration, live updates) may not work in dev mode unless you add a WebSocket proxy entry in `vite.config.js` or access the app directly on port 3001 (after building).

### Optional services (not required for core dev)

- **SMTP (port 25):** Outgoing email (verification, password reset). Without it, registration still succeeds but verification emails won't send. Manually verify users via SQL: `UPDATE users SET email_verified = true WHERE email = '...'`.
- **OpenAI (`OPENAI_API_KEY`):** AI company structure generation and task decomposition.
- **Google OAuth (`GOOGLE_CLIENT_ID`/`SECRET`):** Google SSO login.
