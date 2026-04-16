import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/infra/**/*.test.ts'],
    silent: 'passed-only',
  },
})
