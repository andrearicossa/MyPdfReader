import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      'public/pdfjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/fixtures/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Regola architetturale: src/core è un modulo di dominio puro.
    // Non deve importare UI o storage né usare API del browser.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui', '**/ui/**', '**/storage', '**/storage/**', '**/pdf', '**/pdf/**'],
              message: 'core è indipendente da ui e storage: dipendenza vietata.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core non usa il DOM.' },
        { name: 'document', message: 'core non usa il DOM.' },
        { name: 'localStorage', message: 'core non usa lo storage del browser.' },
        { name: 'indexedDB', message: 'core non usa lo storage del browser.' },
        { name: 'fetch', message: 'core non fa chiamate di rete.' },
      ],
    },
  },
);
