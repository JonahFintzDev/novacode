import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/__tests__/**/*.test.ts'],
    testTimeout: 10_000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
