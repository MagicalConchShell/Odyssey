const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const unusedImports = require('eslint-plugin-unused-imports');
const importPlugin = require('eslint-plugin-import');

module.exports = [
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      'unused-imports': unusedImports,
      'import': importPlugin,
    },
    rules: {
      // Unused imports/exports detection
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      
      // Import/export rules
      // Note: import/no-unused-modules is temporarily disabled due to flat config incompatibility
      // 'import/no-unused-modules': [
      //   'error',
      //   {
      //     unusedExports: true,
      //     src: ['src/**/*.{ts,tsx}'],
      //     ignoreExports: ['src/main.tsx', 'src/App.tsx'], // Entry points
      //   },
      // ],
      
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': 'off', // Handled by unused-imports
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // General code quality
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'warn',
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'electron/', '*.js', '*.d.ts'],
  },
];