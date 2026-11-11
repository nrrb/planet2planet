import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['eslint.config.js', 'dist', 'node_modules', 'src/api/schema.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { react, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, import: importPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Scrollable regions must be keyboard focusable (WCAG 2.1.1), so labelled groups and code blocks may take focus.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['group'], tags: ['pre'] }],
      'import/no-duplicates': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Plain Node scripts are outside the TypeScript project, so they get no type-aware rules.
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // node:test returns promises that the runner collects, so floating test() calls are correct.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // The map owns a mutable SimulationClock outside React state by design (ADR 0001).
    files: ['src/components/SolarSystemMap.tsx'],
    rules: { 'react-hooks/immutability': 'off', 'react-hooks/refs': 'off' },
  },
  prettier,
);
