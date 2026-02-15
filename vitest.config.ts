import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for faster DOM simulation
    environment: 'happy-dom',

    // Test file patterns
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],

    // Global test timeout
    testTimeout: 10000,

    // Setup files to run before each test file
    setupFiles: ['./tests/setup.ts'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/index.ts',
        'src/custom-elements.d.ts'
      ],
      // Thresholds act as a ratchet: set just below current actuals to
      // prevent regressions.  Raise these as coverage improves.
      thresholds: {
        // Global minimums
        statements: 69,
        branches: 57,
        functions: 72,
        lines: 71,

        // Per-file overrides for critical core modules
        'src/core/base-component.ts': {
          statements: 92,
          branches: 91,
          functions: 95,
          lines: 92
        },
        'src/core/security-config.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        },
        // Submit button now has strong coverage
        'src/components/secure-submit-button/secure-submit-button.ts': {
          statements: 92,
          branches: 76,
          functions: 100,
          lines: 94
        }
      }
    },

    // Reporter options
    reporters: ['verbose'],

    // Enable globals (describe, it, expect without imports)
    globals: true
  }
});
