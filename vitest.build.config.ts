import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/build/**/*.test.ts'],
    // No setupFiles — build tests only use Node.js fs, no DOM globals needed.
    reporters: ['verbose'],
    globals: true,
  },
});
