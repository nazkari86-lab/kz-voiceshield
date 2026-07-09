import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/scoring.ts'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
  },
})
