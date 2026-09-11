import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Tests run against the in-memory `DemoRepository`.
 *
 * That is not a mock — it is a full implementation of `DataRepository`
 * doing the same joins, tenant filtering and visibility checks as the
 * SQL one. So a test here exercises the real handler, the real booking
 * engine and the real availability rules, and only the storage differs.
 *
 * `server-only` is stubbed because these modules are server modules by
 * design; the guard exists to keep them out of a client bundle, and a
 * test runner is neither.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
