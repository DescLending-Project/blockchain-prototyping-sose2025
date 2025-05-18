// server/eslint.config.js
import tseslint from 'typescript-eslint';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
    ignores: ['dist/**', 'node_modules/**'],
  },
]);
