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
        // Global minimums (ratchet — set just below actuals, raise as coverage improves)
        statements: 94,
        branches: 83,
        functions: 96,
        lines: 95,

        'src/core/base-component.ts': {
          statements: 97,
          branches: 95,
          functions: 96,
          lines: 97
        },
        'src/core/security-config.ts': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100
        },
        'src/components/secure-submit-button/secure-submit-button.ts': {
          statements: 97,
          branches: 85,
          functions: 100,
          lines: 99
        },
        'src/components/secure-table/secure-table.ts': {
          statements: 90,
          branches: 86,
          functions: 97,
          lines: 93
        },
        'src/components/secure-file-upload/secure-file-upload.ts': {
          statements: 94,
          branches: 76,
          functions: 100,
          lines: 95
        },
        'src/components/secure-input/secure-input.ts': {
          statements: 91,
          branches: 84,
          functions: 94,
          lines: 92
        },
        'src/components/secure-select/secure-select.ts': {
          statements: 97,
          branches: 85,
          functions: 100,
          lines: 98
        },
        'src/components/secure-datetime/secure-datetime.ts': {
          statements: 94,
          branches: 82,
          functions: 96,
          lines: 95
        },
        'src/components/secure-card/secure-card.ts': {
          statements: 97,
          branches: 78,
          functions: 98,
          lines: 100
        },
        'src/components/secure-telemetry-provider/secure-telemetry-provider.ts': {
          statements: 96,
          branches: 83,
          functions: 95,
          lines: 98
        },
        'src/components/secure-form/secure-form.ts': {
          statements: 88,
          branches: 80,
          functions: 88,
          lines: 88
        },
        'src/components/secure-password-confirm/secure-password-confirm.ts': {
          statements: 96,
          branches: 86,
          functions: 100,
          lines: 97
        },
        'src/components/secure-textarea/secure-textarea.ts': {
          statements: 93,
          branches: 87,
          functions: 88,
          lines: 95
        }
      }
    },

    // Reporter options
    reporters: ['verbose'],

    // Enable globals (describe, it, expect without imports)
    globals: true
  }
});
