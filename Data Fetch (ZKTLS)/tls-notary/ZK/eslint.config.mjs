import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

const commonRules = {
  '@typescript-eslint/no-explicit-any': 'warn',
  '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  semi: ['error', 'always'],
  quotes: ['error', 'single'],
};

const commonIgnores = ['dist/**', 'node_modules/**'];
const commonFiles = ["**/*.{js,mjs,cjs,ts,jsx,tsx}"];

export default defineConfig([
  {
    files: commonFiles,
    plugins: { js },
    extends: ["js/recommended"],
    ignores: commonIgnores,
    rules: commonRules,
  },
  {
    files: commonFiles,
    languageOptions: { globals: globals.browser },
    ignores: commonIgnores,
    rules: commonRules,
  },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
]);
