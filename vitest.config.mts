import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each test file seeds its own in-memory database (bcrypt + seed takes a couple of seconds).
    testTimeout: 30000,
    hookTimeout: 60000,
    env: { CRATS_FREEZE_CLOCK: '1', DATABASE_PATH: ':memory:' },
  },
})
