import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'tests/**/*.test.ts', 'components/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
