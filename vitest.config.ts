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
        // Global minimums (ratchet). Raised after branch coverage improvements.
        statements: 89,
        branches: 79,
        functions: 92,
        lines: 90,

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
        'src/components/secure-submit-button/secure-submit-button.ts': {
          statements: 92,
          branches: 77,
          functions: 100,
          lines: 94
        },
        'src/components/secure-table/secure-table.ts': {
          statements: 83,
          branches: 74,
          functions: 87,
          lines: 86
        },
        'src/components/secure-file-upload/secure-file-upload.ts': {
          statements: 93,
          branches: 76,
          functions: 100,
          lines: 94
        },
        'src/components/secure-input/secure-input.ts': {
          statements: 88,
          branches: 82,
          functions: 92,
          lines: 89
        },
        'src/components/secure-select/secure-select.ts': {
          statements: 93,
          branches: 82,
          functions: 97,
          lines: 93
        },
        'src/components/secure-datetime/secure-datetime.ts': {
          statements: 94,
          branches: 82,
          functions: 96,
          lines: 94
        },
        'src/components/secure-form/secure-form.ts': {
          statements: 85,
          branches: 74,
          functions: 82,
          lines: 85
        },
        'src/components/secure-card/secure-card.ts': {
          statements: 97,
          branches: 78,
          functions: 97,
          lines: 100
        }
      }
    },

    // Reporter options
    reporters: ['verbose'],

    // Enable globals (describe, it, expect without imports)
    globals: true
  }
});
