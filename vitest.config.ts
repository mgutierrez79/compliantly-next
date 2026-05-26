import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Vitest is set up to guard W0-4 (UI = signed source). Tests live next
// to the pure derivation functions in src/lib/*.derive.ts and ensure
// every displayed metric on the Evidence / Dashboard / Frameworks heroes
// equals what's actually present in the backend response — no silent
// transformations that would let the dashboard drift from the signed
// source (the Evidence "100% / 1 source" bug class).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Exclude the existing Playwright e2e tests — those have their own
    // runner under tests/e2e.
    exclude: ['node_modules/**', 'tests/e2e/**', '.next/**'],
    globals: false,
    reporters: ['default'],
  },
})
