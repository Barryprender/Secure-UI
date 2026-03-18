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
      // detect-object-injection: all real prototype-pollution vectors were fixed
      // with Object.hasOwn guards and Object.create(null) accumulators.
      // Remaining hits are false positives (bounded loop indices, etc.).
      'security/detect-object-injection': 'off',
      'no-eval': 'error',

      // ── TypeScript safety ───────────────────────────────────────────────────
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      // String(unknown) is intentional in sanitize/filter/mask helpers
      '@typescript-eslint/no-base-to-string': 'off',
      // Off — getAttribute() returns string|null. Using || for fallbacks is
      // intentionally correct: empty-string attributes (e.g. rows="", type="")
      // should also fall back to defaults. Switching to ?? would keep '' and
      // cause parseInt/''/NaN bugs. The || usage here is by design.
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-deprecated': 'warn',

      // ── Off — patterns are intentional in Web Component code ────────────────
      // Shadow DOM APIs are nullable by type but always set before use via
      // render(). The ! assertion is correct: it throws on null (better than ?.
      // silently doing nothing). 268 warnings with zero actionable value.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Numbers in template literals are valid and expected
      '@typescript-eslint/restrict-template-expressions': 'off',
      // Fires as false-positives on lifecycle defensive checks where TypeScript's
      // type narrowing does not account for Web Component lifecycle ordering.
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
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
      'security/detect-object-injection': 'off',
    },
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  }
);
