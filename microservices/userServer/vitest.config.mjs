import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Unit-тесты не требуют БД; интеграционные (auth-routes/auth-session)
    // подтягивают корневой .env через setup.mjs.
    setupFiles: ['./tests/setup.mjs'],
    include: ['tests/backend/**/*.test.mjs'],
  },
});
