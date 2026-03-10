import tseslint from 'typescript-eslint';
import security from 'eslint-plugin-security';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'node_modules/**',
      'coverage/**',
      'examples/**',
      'server.js',
      'eslint.config.js',
    ],
  },

  // Source files — recommended + targeted strict rules + security plugin
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
    ],
    plugins: {
      security,
    },
    rules: {
      // ── Security (errors — these represent real risks) ──────────────────────
      'security/detect-eval-with-expression': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-non-literal-regexp': 'warn',
      // detect-object-injection fires on row[col.key] patterns in the table
      // which are intentional server-trusted data accesses — downgrade to warn
      'security/detect-object-injection': 'warn',
      'no-eval': 'error',

      // ── TypeScript safety ───────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // String(unknown) is intentional in sanitize/filter/mask helpers
      '@typescript-eslint/no-base-to-string': 'off',
      // Downgraded to warn — existing code uses || for default-value patterns
      // where getAttribute() returns null|string (never 0/false), so || is safe.
      // Fix incrementally as each file is touched.
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-deprecated': 'warn',

      // ── Downgraded — too many intentional patterns in Web Component code ───
      // Shadow DOM APIs return nullable types; ! assertions are used intentionally
      // after connectedCallback guards. Enforce as warning rather than error.
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Numbers in template literals are valid and expected
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Unnecessary conditions can be false-positives with strict type checking
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Test files — relaxed rules (any allowed, no return types required)
  {
    files: ['tests/**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
    ],
    plugins: {
      security,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'security/detect-object-injection': 'warn',
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
