import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'client/**'],
    },
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/unit/lib/**/*.test.ts', 'tests/integration/**/*.test.ts'],
          environment: 'node',
          setupFiles: ['tests/setup/node.ts'],
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/unit/client/**/*.test.ts'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/browser.ts'],
        },
      },
    ],
  },
})
