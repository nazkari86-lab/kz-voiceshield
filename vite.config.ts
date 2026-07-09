import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    exclude: ['dist/**', 'e2e/**', 'mobile/**', 'node_modules/**'],
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
