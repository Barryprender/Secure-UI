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
        // Global minimums — set just below current actuals (ratchet pattern).
        // Target: 85% statements / 80% branches. Raise as coverage improves.
        statements: 80,
        branches: 70,
        functions: 83,
        lines: 82,

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
        // Submit button
        'src/components/secure-submit-button/secure-submit-button.ts': {
          statements: 92,
          branches: 76,
          functions: 100,
          lines: 94
        },
        // Table improved significantly with interaction tests
        'src/components/secure-table/secure-table.ts': {
          statements: 83,
          branches: 73,
          functions: 87,
          lines: 86
        },
        // File upload: major improvement from 35% → 77% branches
        'src/components/secure-file-upload/secure-file-upload.ts': {
          statements: 93,
          branches: 76,
          functions: 100,
          lines: 94
        },
        // Input: major improvement from 52% → 83% branches
        'src/components/secure-input/secure-input.ts': {
          statements: 88,
          branches: 82,
          functions: 92,
          lines: 89
        }
      }
    },

    // Reporter options
    reporters: ['verbose'],

    // Enable globals (describe, it, expect without imports)
    globals: true
  }
});
